import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * state 블록 내부에서 on_start 선언 횟수를 계산합니다.
 * @param block - 검사할 GUI 블록 문자열
 * @param stateName - 검사할 state 이름
 * @returns 해당 state 내부의 on_start 개수 (찾지 못하면 -1)
 */
const countOnStartInState = (block: string, stateName: string): number => {
  const escaped = stateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`state\\s*=\\s*\\{[^}]*name\\s*=\\s*["']?${escaped}["']?[^}]*\\}`, 's')
  const match = block.match(regex)
  if (!match) return -1
  const onStarts = match[0].match(/\bon_start\s*=/g)
  return onStarts ? onStarts.length : 0
}

describe('대형 이벤트 및 활동(Activity) 창 자동 TTS 복원 및 체이닝 무결성 검증', () => {
  const windowActivityPath = join(process.cwd(), 'ck3-mod/gui/window_activity.gui')
  const windowActivityLocalePath = join(process.cwd(), 'ck3-mod/gui/window_activity_locale.gui')
  const fullscreenEventPath = join(process.cwd(), 'ck3-mod/gui/event_windows/fullscreen_event.gui')
  const schemePrepEventPath = join(process.cwd(), 'ck3-mod/gui/event_windows/scheme_preparations_event.gui')
  const logWatcherPath = join(process.cwd(), 'src/main/logWatcher.ts')

  it('1. window_activity.gui의 activity_event_widget(대관식·결혼식·사냥·연회·순례 등)에 자동 TTS 3단계 체이닝이 복원되고 안내 배지가 제거되어야 한다', () => {
    const content = readFileSync(windowActivityPath, 'utf8')
    const widgetStart = content.indexOf('type activity_event_widget = margin_widget')
    const baseStart = content.indexOf('type activity_event_widget_base = widget')
    assert.ok(widgetStart !== -1 && baseStart !== -1, 'activity_event_widget 블록이 존재해야 합니다.')

    const widgetBlock = content.slice(widgetStart, baseStart)

    // 1) 진입 경로 검증 (_show 및 activity_new_event_shown -> tts_activity_event_auto_play)
    assert.match(
      widgetBlock,
      /state\s*=\s*\{\s*name\s*=\s*_show\s+next\s*=\s*tts_activity_event_auto_play\s*\}/,
      'activity_event_widget에 _show -> tts_activity_event_auto_play 진입점이 있어야 합니다.'
    )
    assert.match(
      widgetBlock,
      /name\s*=\s*"?activity_new_event_shown"?[\s\S]*?next\s*=\s*tts_activity_event_auto_play/,
      'activity_new_event_shown state가 tts_activity_event_auto_play로 체이닝되어야 합니다.'
    )

    // 2) 3단계 체이닝 존재 및 단일 on_start 원칙 검증 (on_start 중복 덮어쓰기 버그 방지)
    assert.equal(
      countOnStartInState(widgetBlock, 'tts_activity_event_auto_play'),
      1,
      'tts_activity_event_auto_play는 단일 on_start(변수 저장)만 가져야 합니다.'
    )
    assert.equal(
      countOnStartInState(widgetBlock, 'tts_activity_clipboard_play'),
      1,
      'tts_activity_clipboard_play는 단일 on_start(CopyStringToClipboard)만 가져야 합니다.'
    )
    assert.equal(
      countOnStartInState(widgetBlock, 'tts_activity_console_fallback'),
      1,
      'tts_activity_console_fallback는 단일 on_start(ExecuteConsoleCommand)만 가져야 합니다.'
    )

    // 3) "대형 이벤트 자동 재생 불가" 안내 라벨 제거 및 수동 버튼 유지 확인
    assert.ok(
      !widgetBlock.includes('tts_speak_notice'),
      'activity_event_widget에 대형 이벤트 자동 재생 불가 안내 라벨(tts_speak_notice)이 남아있지 않아야 합니다.'
    )
    assert.ok(
      widgetBlock.includes('name = "tts_speak_button"'),
      '수동 다시 듣기 버튼(tts_speak_button)은 유지되어야 합니다.'
    )
  })

  it('2. window_activity.gui의 activity_event_widget_base(토너먼트 등 거점 일반 이벤트 부모 타입)에도 동일한 자동 TTS 3단계 체이닝이 복원되어야 한다', () => {
    const content = readFileSync(windowActivityPath, 'utf8')
    const baseStart = content.indexOf('type activity_event_widget_base = widget')
    assert.ok(baseStart !== -1, 'activity_event_widget_base 블록이 존재해야 합니다.')

    const baseBlock = content.slice(baseStart)

    assert.match(
      baseBlock,
      /state\s*=\s*\{\s*name\s*=\s*_show\s+next\s*=\s*tts_activity_event_auto_play\s*\}/,
      'activity_event_widget_base에 _show -> tts_activity_event_auto_play 진입점이 있어야 합니다.'
    )
    assert.equal(
      countOnStartInState(baseBlock, 'tts_activity_event_auto_play'),
      1,
      'activity_event_widget_base의 tts_activity_event_auto_play는 단일 on_start만 가져야 합니다.'
    )
    assert.equal(
      countOnStartInState(baseBlock, 'tts_activity_clipboard_play'),
      1,
      'activity_event_widget_base의 tts_activity_clipboard_play는 단일 on_start만 가져야 합니다.'
    )
    assert.equal(
      countOnStartInState(baseBlock, 'tts_activity_console_fallback'),
      1,
      'activity_event_widget_base의 tts_activity_console_fallback는 단일 on_start만 가져야 합니다.'
    )
    assert.ok(
      !baseBlock.includes('tts_speak_notice'),
      'activity_event_widget_base에 대형 이벤트 자동 재생 불가 안내 라벨(tts_speak_notice)이 없어야 합니다.'
    )
  })

  it('3. window_activity.gui 최상단 _hide 및 window_activity_locale.gui의 state들에 on_start 중복 선언이 없어야 한다', () => {
    const activityContent = readFileSync(windowActivityPath, 'utf8')
    const topWindowSlice = activityContent.slice(0, 1500)
    assert.equal(
      countOnStartInState(topWindowSlice, '_hide'),
      1,
      'window_activity 최상단 _hide state는 단일 on_start만 가져야 합니다.'
    )

    const localeContent = readFileSync(windowActivityLocalePath, 'utf8')
    const fsStart = localeContent.indexOf('type widget_activity_locale_fullscreen_event = widget')
    assert.ok(fsStart !== -1, 'widget_activity_locale_fullscreen_event 블록이 존재해야 합니다.')
    const fsBlock = localeContent.slice(fsStart)
    const childWidgetStart = fsBlock.indexOf('\n\t\twidget = {')
    assert.ok(childWidgetStart !== -1, '내부 자식 widget 블록이 존재해야 합니다.')
    const rootLevelBlock = fsBlock.slice(0, childWidgetStart)

    assert.match(
      rootLevelBlock,
      /state\s*=\s*\{\s*name\s*=\s*_show\s+next\s*=\s*tts_activity_event_auto_play\s*\}/,
      'widget_activity_locale_fullscreen_event 루트 레벨에 _show -> tts_activity_event_auto_play 진입점이 있어야 합니다.'
    )
    assert.equal(
      countOnStartInState(rootLevelBlock, 'tts_activity_event_auto_play'),
      1,
      'tts_activity_event_auto_play는 _show와 동일한 루트 위젯 레벨에 존재하여 next 체이닝이 단절되지 않아야 합니다.'
    )
    assert.equal(
      countOnStartInState(rootLevelBlock, 'tts_activity_clipboard_play'),
      1,
      'tts_activity_clipboard_play는 동일한 루트 위젯 레벨에 존재해야 합니다.'
    )
    assert.equal(
      countOnStartInState(rootLevelBlock, 'tts_activity_console_fallback'),
      1,
      'tts_activity_console_fallback는 동일한 루트 위젯 레벨에 존재해야 합니다.'
    )
    assert.equal(
      countOnStartInState(fsBlock, 'activity_new_event_shown'),
      1,
      'widget_activity_locale_fullscreen_event의 activity_new_event_shown은 단일 on_start만 가져야 합니다.'
    )
  })

  it('4. fullscreen_event.gui 및 scheme_preparations_event.gui에서 자동 TTS 체이닝과 단일 on_start 규칙이 보장되어야 한다', () => {
    const fsEventContent = readFileSync(fullscreenEventPath, 'utf8')
    assert.match(
      fsEventContent,
      /name\s*=\s*"fade_in"[\s\S]*?next\s*=\s*tts_console_fallback/,
      'fullscreen_event.gui의 fade_in state가 tts_console_fallback으로 체이닝되어야 합니다.'
    )

    const schemePrepContent = readFileSync(schemePrepEventPath, 'utf8')
    assert.equal(
      countOnStartInState(schemePrepContent, '_show'),
      1,
      'scheme_preparations_event.gui의 _show state는 단일 on_start만 가져야 합니다.'
    )
  })

  it('5. logWatcher.ts에서 ##CK3_TTS_STOP## 이후 새로운 미완성 이벤트(##CK3_TTS##)가 시작된 경우 불필요한 onStop 호출을 방지해야 한다', () => {
    const watcherContent = readFileSync(logWatcherPath, 'utf8')
    assert.ok(
      watcherContent.includes('hasNewerPendingEvent'),
      'logWatcher.ts에 STOP 이후 시작된 미완성 이벤트(hasNewerPendingEvent) 가드가 존재해야 합니다.'
    )
  })
})
