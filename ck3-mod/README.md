# ⚔️ CK3 TTS Companion - 인게임 모드 설치 안내

이 모드는 크루세이더 킹즈 3(CK3)의 이벤트 창에서 발생하는 텍스트를 게임 로그(`debug.log`)로 출력하여, 데스크톱 컴패니언 앱이 실시간으로 음성(TTS)을 합성할 수 있도록 연결해 주는 브릿지 모드입니다.

---

## 1. 모드 폴더 복사

현재 `ck3-mod` 폴더 전체를 자신의 운영체제에 맞는 CK3 모드 폴더로 복사합니다.

### 🍎 macOS
```bash
~/Documents/Paradox Interactive/Crusader Kings III/mod/ck3-tts-companion
```

### 🪟 Windows
```text
C:\Users\<사용자명>\Documents\Paradox Interactive\Crusader Kings III\mod\ck3-tts-companion
```

---

## 2. 게임 런처에서 모드 활성화

1. **Paradox Launcher**를 실행합니다.
2. 좌측 메뉴에서 **플레이셋(Playsets)**을 선택합니다.
3. **모드 추가(Add More Mods)**를 클릭하고 **CK3 TTS Companion Bridge**를 체크하여 활성화합니다.

---

## 3. 디버그 모드(-debug_mode) 켜기 (필수)

게임 엔진이 `debug.log` 파일에 이벤트 내용을 실시간으로 기록할 수 있도록 스팀 시작 옵션에 디버그 모드를 활성화해야 합니다.

1. **Steam 라이브러리**에서 *Crusader Kings III*를 우클릭하고 **[속성(Properties)]**을 엽니다.
2. **일반(General)** 탭 하단의 **[시작 옵션(Launch Options)]** 란에 아래 명령어를 입력합니다:
   ```text
   -debug_mode
   ```
3. 게임을 실행합니다.

---

## 4. 인게임 사용법

- 이벤트 창이 팝업되면 **`F` 키**를 누르거나 모드가 제공하는 사운드 아이콘을 클릭합니다.
- 지문이 즉시 데스크톱 컴패니언 앱으로 전송되어 자연스러운 한국어(Edge-TTS 또는 Gemini 2.0 AI 나레이터)로 낭독됩니다!
