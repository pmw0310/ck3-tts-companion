import type { ExecutionSoundType } from '@/shared/types';

/**
 * 처형 효과음 개별 오디오 에셋 식별 키
 */
export type ExecutionSoundKey =
  | 'burning_female'
  | 'burning_male'
  | 'sacrifice_female'
  | 'sacrifice_male'
  | 'kennel_female'
  | 'kennel_male'
  | 'public_female'
  | 'public_male'
  | 'devour_female'
  | 'devour_male'
  | 'beheading'
  | 'hanging'
  | 'generic';

/**
 * 사형 유형과 죄수의 성별(M/F)을 기반으로 최적의 사운드 에셋 키를 결정합니다.
 * 비명 및 고통 호소가 수반되는 5대 사형(화형, 제물 공양, 맹견형, 관통/공개, 식인 포식)은 성별에 따라 전용 에셋 키로 분기합니다.
 * @param type 사형 방식 분류
 * @param gender 죄수 성별 ('M' | 'F' | 'UNKNOWN')
 * @returns 사운드 에셋 키
 */
export const resolveExecutionSoundKey = (
  type: ExecutionSoundType,
  gender: 'M' | 'F' | 'UNKNOWN'
): ExecutionSoundKey => {
  if (type === 'burning') {
    return gender === 'F' ? 'burning_female' : 'burning_male';
  }

  if (type === 'sacrifice') {
    return gender === 'F' ? 'sacrifice_female' : 'sacrifice_male';
  }

  if (type === 'kennel') {
    return gender === 'F' ? 'kennel_female' : 'kennel_male';
  }

  if (type === 'public') {
    return gender === 'F' ? 'public_female' : 'public_male';
  }

  if (type === 'devour') {
    return gender === 'F' ? 'devour_female' : 'devour_male';
  }

  if (type === 'beheading') {
    return 'beheading';
  }

  if (type === 'hanging') {
    return 'hanging';
  }

  return 'generic';
};
