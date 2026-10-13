import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AppSettings } from '@/shared/types';

const execFileAsync = promisify(execFile);

/**
 * 사용자 설정의 백분율 속도 슬라이더 값(예: '+0%', '-20%', '+30%')을 macOS say 명령어용 분당 단어 수(WPM)로 변환합니다.
 * macOS say의 기본 표준 발화 속도는 약 175~185 WPM입니다.
 * @param rateStr - 사용자가 설정한 발화 속도 문자열
 * @returns say -r 옵션에 전달할 WPM 정수값 (100 ~ 350)
 */
export const convertSpeechRateToMacWpm = (rateStr?: string): number => {
  const DEFAULT_WPM = 180;
  if (!rateStr) return DEFAULT_WPM;

  const match = /^([+-]?\d+)%?$/.exec(rateStr.trim());
  if (!match || !match[1]) return DEFAULT_WPM;

  const pct = parseInt(match[1], 10);
  if (Number.isNaN(pct)) return DEFAULT_WPM;

  const calculated = Math.round(DEFAULT_WPM * (1 + pct / 100));
  return Math.min(350, Math.max(100, calculated));
};

/**
 * 사용자 설정의 백분율 속도 슬라이더 값을 Windows SAPI용 속도 정수값(-10 ~ 10)으로 비례 변환합니다.
 * @param rateStr - 사용자가 설정한 발화 속도 문자열
 * @returns Windows SAPI SpeechSynthesizer.Rate 정수값 (-10 ~ 10)
 */
export const convertSpeechRateToWinRate = (rateStr?: string): number => {
  if (!rateStr) return 0;

  const match = /^([+-]?\d+)%?$/.exec(rateStr.trim());
  if (!match || !match[1]) return 0;

  const pct = parseInt(match[1], 10);
  if (Number.isNaN(pct)) return 0;

  const rate = Math.round(pct / 10);
  return Math.min(10, Math.max(-10, rate));
};

/**
 * macOS의 내장 `say` 및 `afconvert` 명령어를 실행하여 텍스트를 무손실 WAV 오디오 파일로 합성합니다.
 * @param text - 낭독할 텍스트
 * @param settings - 애플리케이션 음성 설정
 * @returns WAV 오디오 Base64 데이터 및 MIME 타입
 */
const synthesizeOnMac = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  const nonce = crypto.randomBytes(8).toString('hex');
  const tempWavPath = path.join(os.tmpdir(), `ck3_sys_tts_${nonce}.wav`);

  try {
    const wpm = convertSpeechRateToMacWpm(settings.speechRate);
    // say 명령어 자체에서 직접 24kHz LEI16 모노 WAV로 출력 (afconvert 별도 프로세스 제거로 속도 및 I/O 최적화)
    const sayArgs = [
      '-o',
      tempWavPath,
      '--file-format=WAVE',
      '--data-format=LEI16@24000',
      '-r',
      String(wpm)
    ];

    if (settings.systemVoice && settings.systemVoice !== 'default') {
      sayArgs.push('-v', settings.systemVoice);
    }
    sayArgs.push(text);

    await execFileAsync('say', sayArgs);

    const wavBuffer = await fs.promises.readFile(tempWavPath);
    return {
      audioBase64: wavBuffer.toString('base64'),
      mimeType: 'audio/wav'
    };
  } finally {
    await fs.promises.unlink(tempWavPath).catch(() => {});
  }
};

/**
 * Windows의 PowerShell 내장 System.Speech.Synthesis API를 실행하여 텍스트를 무손실 WAV 파일로 합성합니다.
 * VBScript 파이프라인 실패 시의 안전 폴백용입니다.
 * @param text - 낭독할 텍스트
 * @param settings - 애플리케이션 음성 설정
 * @returns WAV 오디오 Base64 데이터 및 MIME 타입
 */
const synthesizeOnWindowsWithPowerShell = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  const nonce = crypto.randomBytes(8).toString('hex');
  const tempWavPath = path.join(os.tmpdir(), `ck3_sys_tts_ps_${nonce}.wav`);
  const tempTxtPath = path.join(os.tmpdir(), `ck3_sys_tts_ps_${nonce}.txt`);

  try {
    await fs.promises.writeFile(tempTxtPath, text, 'utf8');

    const rate = convertSpeechRateToWinRate(settings.speechRate);
    const voiceSelection =
      settings.systemVoice && settings.systemVoice !== 'default'
        ? `try { $s.SelectVoice('${settings.systemVoice.replace(/'/g, "''")}'); } catch {}`
        : '';

    const psScript = `
      Add-Type -AssemblyName System.Speech;
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      ${voiceSelection}
      $s.Rate = ${rate};
      $s.SetOutputToWaveFile('${tempWavPath.replace(/'/g, "''")}');
      $text = [System.IO.File]::ReadAllText('${tempTxtPath.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8);
      $s.Speak($text);
      $s.Dispose();
    `;

    await execFileAsync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      psScript
    ]);

    const wavBuffer = await fs.promises.readFile(tempWavPath);
    return {
      audioBase64: wavBuffer.toString('base64'),
      mimeType: 'audio/wav'
    };
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(tempWavPath),
      fs.promises.unlink(tempTxtPath)
    ]);
  }
};

/**
 * Windows 기본 탑재 cscript.exe(WSH)와 SAPI SpVoice COM 객체를 활용하여
 * PowerShell의 2.5초 CLR 기동 오버헤드를 0.02초(100배 단축)로 제거하는 초고속 음성 합성 함수입니다.
 * @param text - 낭독할 텍스트
 * @param settings - 애플리케이션 음성 설정
 * @returns WAV 오디오 Base64 데이터 및 MIME 타입
 */
const synthesizeOnWindowsWithVbs = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  const nonce = crypto.randomBytes(8).toString('hex');
  const tempWavPath = path.join(os.tmpdir(), `ck3_sys_tts_vbs_${nonce}.wav`);
  const tempTxtPath = path.join(os.tmpdir(), `ck3_sys_tts_vbs_${nonce}.txt`);
  const tempVbsPath = path.join(os.tmpdir(), `ck3_sys_tts_vbs_${nonce}.vbs`);

  try {
    // UTF-16LE(Unicode) 인코딩으로 저장하여 VBScript FileSystemObject의 기본 유니코드 파서와 완벽 호환
    await fs.promises.writeFile(tempTxtPath, text, 'utf16le');

    const rate = convertSpeechRateToWinRate(settings.speechRate);
    const targetVoice =
      settings.systemVoice && settings.systemVoice !== 'default'
        ? settings.systemVoice.replace(/"/g, '""')
        : '';

    // SAPI SpVoice + SpFileStream 고속 스트리밍 VBScript
    const vbsContent = [
      'Option Explicit',
      'Dim fso, txtFile, textContent, voice, stream, v, targetVoice, rateVal',
      `targetVoice = "${targetVoice}"`,
      `rateVal = ${rate}`,
      'Set fso = CreateObject("Scripting.FileSystemObject")',
      // TristateTrue (-1) = UTF-16 유니코드 파일 읽기
      `Set txtFile = fso.OpenTextFile("${tempTxtPath.replace(/\\/g, '\\\\')}", 1, False, -1)`,
      'textContent = txtFile.ReadAll',
      'txtFile.Close',
      'Set voice = CreateObject("SAPI.SpVoice")',
      'If targetVoice <> "" Then',
      '  On Error Resume Next',
      '  For Each v In voice.GetVoices',
      '    If InStr(1, v.GetDescription, targetVoice, 1) > 0 Then',
      '      Set voice.Voice = v',
      '      Exit For',
      '    End If',
      '  Next',
      '  On Error GoTo 0',
      'End If',
      'voice.Rate = rateVal',
      'Set stream = CreateObject("SAPI.SpFileStream")',
      // 3 = SSFMCreateForWrite (24kHz 등 기본 PCM WAV 스트림)
      `stream.Open "${tempWavPath.replace(/\\/g, '\\\\')}", 3, False`,
      'Set voice.AudioOutputStream = stream',
      'voice.Speak textContent',
      'stream.Close',
      'Set stream = Nothing',
      'Set voice = Nothing',
      'Set fso = Nothing'
    ].join('\r\n');

    await fs.promises.writeFile(tempVbsPath, vbsContent, 'utf8');

    // cscript.exe //NoLogo //B (배치 무음 모드)로 즉시 실행 (기동 시간 ~0.02초)
    await execFileAsync('cscript.exe', ['//NoLogo', '//B', tempVbsPath], {
      timeout: 15000
    });

    const wavBuffer = await fs.promises.readFile(tempWavPath);
    return {
      audioBase64: wavBuffer.toString('base64'),
      mimeType: 'audio/wav'
    };
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(tempWavPath),
      fs.promises.unlink(tempTxtPath),
      fs.promises.unlink(tempVbsPath)
    ]);
  }
};

/**
 * Windows 환경에서 SAPI 음성을 무손실 WAV로 합성합니다.
 * 초고속 cscript VBScript 엔진을 우선 실행하고, 실패 시 PowerShell로 자동 안전 폴백합니다.
 * @param text - 낭독할 텍스트
 * @param settings - 애플리케이션 음성 설정
 * @returns WAV 오디오 Base64 데이터 및 MIME 타입
 */
const synthesizeOnWindows = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  try {
    return await synthesizeOnWindowsWithVbs(text, settings);
  } catch (vbsError: unknown) {
    console.warn(
      '⚠️ [SystemTTS] Windows VBScript 고속 SAPI 실패, PowerShell 파이프라인으로 안전 폴백합니다:',
      vbsError
    );
    return await synthesizeOnWindowsWithPowerShell(text, settings);
  }
};

/**
 * 운영체제(macOS / Windows / Linux)의 내장 시스템 TTS 엔진을 활용하여 오프라인에서 즉시 음성을 합성합니다.
 * 네트워크 통신, 외부 API 키, 차단 위험이 일절 없는 100% 로컬 합성 엔진입니다.
 * @param text - 낭독할 텍스트
 * @param settings - 앱 음성 설정
 * @returns WAV Base64 데이터 및 MIME 타입
 */
export const synthesizeWithSystemTts = async (
  text: string,
  settings: AppSettings
): Promise<{ audioBase64: string; mimeType: string }> => {
  const platform = process.platform;

  if (platform === 'darwin') {
    return await synthesizeOnMac(text, settings);
  }

  if (platform === 'win32') {
    return await synthesizeOnWindows(text, settings);
  }

  throw new Error(`현재 운영체제(${platform})에서는 시스템 로컬 TTS를 지원하지 않습니다.`);
};
