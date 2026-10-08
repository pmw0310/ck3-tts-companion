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

/** 동시에 겹쳐 재생 가능한 처형음 최대 개수 (연속 처형 시 앞 소리가 잘리지 않도록) */
const EXECUTION_AUDIO_POOL_SIZE = 3;

/** 모듈 수명 동안 유지되는 처형음 오디오 풀 (GC 회수로 인한 재생 단절 방지) */
const executionAudioPool: HTMLAudioElement[] = [];
/** 모두 재생 중일 때 다음으로 재사용할 풀 인덱스 (가장 오래된 것부터 순환) */
let nextPoolIndex = 0;

/**
 * 처형음 재생에 사용할 HTMLAudioElement를 반환합니다.
 * DOM의 #execution-audio-player를 풀의 첫 요소로 사용하고, 재생 중이면 추가 인스턴스를 사용합니다.
 * @returns 사용 가능한 오디오 엘리먼트, 오디오 API가 없는 환경이면 null
 */
const getExecutionAudioElement = (): HTMLAudioElement | null => {
  if (executionAudioPool.length === 0 && typeof document !== 'undefined') {
    const domAudio = document.getElementById('execution-audio-player');
    if (domAudio instanceof HTMLAudioElement) {
      executionAudioPool.push(domAudio);
    }
  }

  // 재생이 끝난(또는 멈춘) 요소를 우선 재사용
  const idleAudio = executionAudioPool.find((audio) => audio.paused || audio.ended);
  if (idleAudio) {
    return idleAudio;
  }

  if (executionAudioPool.length < EXECUTION_AUDIO_POOL_SIZE && typeof Audio !== 'undefined') {
    const newAudio = new Audio();
    executionAudioPool.push(newAudio);
    return newAudio;
  }

  if (executionAudioPool.length === 0) {
    return null;
  }

  // 풀이 가득 찼고 모두 재생 중이면 가장 오래된 요소부터 순환 재사용
  const recycledAudio = executionAudioPool[nextPoolIndex % executionAudioPool.length] ?? null;
  nextPoolIndex = (nextPoolIndex + 1) % executionAudioPool.length;
  return recycledAudio;
};

/**
 * 처형 사운드 이벤트를 받아 사운드를 즉시 재생합니다.
 * DOM 영속 엘리먼트를 활용하여 가비지 컬렉션(GC)으로 인한 오디오 단절을 원천 방어합니다.
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

    // 500ms 이내 동일 사운드 중복 실행만 방어 (초고속 연타 클릭 방어 및 연속 처형 보장)
    if (lastPlayed && now - lastPlayed < 500) {
      console.info(
        `ℹ️ [ExecutionSound] 최근 재생된 사운드 중복 방어로 건너뜀: soundKey=${soundKey}`
      );
      return;
    }
    lastPlayedSoundMap.set(soundKey, now);

    const soundUrl = resolveExecutionSoundUrl(event.type, genderKey);
    const audio = getExecutionAudioElement();

    if (!audio) {
      console.warn('⚠️ [ExecutionSound] 오디오 엘리먼트를 초기화할 수 없습니다.');
      return;
    }

    // 재사용되는 요소는 처음부터 재생되도록 초기화
    audio.pause();
    audio.currentTime = 0;

    // 볼륨 경계값 보정 (0.0 ~ 1.0)
    const clampedVolume = Math.max(0, Math.min(1, volume));
    audio.volume = clampedVolume;
    audio.src = soundUrl;

    console.info(
      `⚔️ [ExecutionSound] 사운드 재생 시작: type=${event.type}, gender=${event.gender}, soundKey=${soundKey}, volume=${clampedVolume}`
    );

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err: unknown) => {
        console.warn('⚠️ [ExecutionSound] 오디오 재생 실패 (자동 재생 권한 등):', err);
      });
    }
  } catch (error: unknown) {
    console.error('❌ [ExecutionSound] 처형 사운드 생성 실패:', error);
  }
};
