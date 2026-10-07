import type { ExecutionSoundEvent, ExecutionSoundType } from '@/shared/types';
import {
  resolveExecutionSoundKey,
  type ExecutionSoundKey
} from '@/shared/executionSoundHelper';

import beheadingSound from '@/renderer/assets/sounds/executions/beheading.mp3';
import burningFemaleSound from '@/renderer/assets/sounds/executions/burning_female.mp3';
import burningMaleSound from '@/renderer/assets/sounds/executions/burning_male.mp3';
import devourFemaleSound from '@/renderer/assets/sounds/executions/devour_female.mp3';
import devourMaleSound from '@/renderer/assets/sounds/executions/devour_male.mp3';
import genericSound from '@/renderer/assets/sounds/executions/generic.mp3';
import hangingSound from '@/renderer/assets/sounds/executions/hanging.mp3';
import kennelFemaleSound from '@/renderer/assets/sounds/executions/kennel_female.mp3';
import kennelMaleSound from '@/renderer/assets/sounds/executions/kennel_male.mp3';
import publicFemaleSound from '@/renderer/assets/sounds/executions/public_female.mp3';
import publicMaleSound from '@/renderer/assets/sounds/executions/public_male.mp3';
import sacrificeFemaleSound from '@/renderer/assets/sounds/executions/sacrifice_female.mp3';
import sacrificeMaleSound from '@/renderer/assets/sounds/executions/sacrifice_male.mp3';

/**
 * 처형 효과음 키별 MP3 자산 URL 매핑 레코드
 */
const SOUND_ASSET_MAP: Record<ExecutionSoundKey, string> = {
  beheading: beheadingSound,
  burning_female: burningFemaleSound,
  burning_male: burningMaleSound,
  devour_female: devourFemaleSound,
  devour_male: devourMaleSound,
  generic: genericSound,
  hanging: hangingSound,
  kennel_female: kennelFemaleSound,
  kennel_male: kennelMaleSound,
  public_female: publicFemaleSound,
  public_male: publicMaleSound,
  sacrifice_female: sacrificeFemaleSound,
  sacrifice_male: sacrificeMaleSound
};

/**
 * 사형 유형과 죄수의 성별(M/F)을 기반으로 적합한 MP3 사운드 URL을 결정합니다.
 * @param type 사형 방식 분류
 * @param gender 죄수 성별 ('M' | 'F' | 'UNKNOWN')
 * @returns 재생할 MP3 파일 경로 또는 URL
 */
export const resolveExecutionSoundUrl = (
  type: ExecutionSoundType,
  gender: 'M' | 'F' | 'UNKNOWN'
): string => {
  const soundKey = resolveExecutionSoundKey(type, gender);
  return SOUND_ASSET_MAP[soundKey] ?? genericSound;
};

/** 최근 재생된 사운드 키별 타임스탬프 맵 (중복/에코 방어용) */
const lastPlayedSoundMap = new Map<string, number>();

/**
 * 처형 사운드 이벤트를 받아 사운드를 즉시 재생합니다.
 * C++ 콘솔 에코 및 빠른 창 전환으로 인한 중복 재생을 방어합니다.
 * @param event 처형 효과음 이벤트 객체
 * @param volume 볼륨 크기 (0.0 ~ 1.0)
 */
export const playExecutionSound = (
  event: ExecutionSoundEvent,
  volume: number
): void => {
  try {
    const genderKey = event.gender === 'female' ? 'F' : 'M';
    const soundKey = resolveExecutionSoundKey(event.type, genderKey);
    const now = Date.now();
    const lastPlayed = lastPlayedSoundMap.get(soundKey);

    // 3초 이내 동일 사운드 중복 재생 차단 (C++ 콘솔 에코 및 창 이벤트 연쇄 방어)
    if (lastPlayed && now - lastPlayed < 3000) {
      console.info(
        `ℹ️ [ExecutionSound] 최근 재생된 사운드 중복 방어로 건너뜀: soundKey=${soundKey}`
      );
      return;
    }
    lastPlayedSoundMap.set(soundKey, now);

    const soundUrl = resolveExecutionSoundUrl(event.type, genderKey);
    const audio = new Audio(soundUrl);

    // 볼륨 경계값 보정 (0.0 ~ 1.0)
    const clampedVolume = Math.max(0, Math.min(1, volume));
    audio.volume = clampedVolume;

    console.info(
      `⚔️ [ExecutionSound] 사운드 재생 시작: type=${event.type}, gender=${event.gender}, volume=${clampedVolume}`
    );

    // 재생 완료 시 메모리 해제
    audio.onended = () => {
      audio.src = '';
    };

    audio.onerror = (e: Event | string) => {
      console.error('❌ [ExecutionSound] 오디오 재생 오류:', e);
      audio.src = '';
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err: unknown) => {
        console.warn('⚠️ [ExecutionSound] 자동 재생 방지 또는 I/O 오류:', err);
      });
    }
  } catch (error: unknown) {
    console.error('❌ [ExecutionSound] 처형 사운드 생성 실패:', error);
  }
};
