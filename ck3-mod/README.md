# ⚔️ CK3 TTS Companion - 인게임 모드 설치 및 사용 매뉴얼

이 모드는 크루세이더 킹즈 3(CK3)의 이벤트 창에서 발생하는 사건 내러티브와 대사를 게임 로그(`debug.log`)로 실시간 출력하여, 데스크톱 컴패니언 앱이 음성(TTS)으로 합성하고 낭독할 수 있도록 연결해 주는 인게임 브릿지 모드입니다.

---

## 1. 🚀 모드 설치 방법

### 방법 A: 데스크톱 앱에서 원클릭 자동 동기화 (권장)

터미널에서 아래 명령어를 실행하면 사용 중인 운영체제의 실제 게임 모드 폴더로 모든 파일이 자동 복사됩니다:

```bash
npm run sync:mod
```

### 방법 B: 수동 복사

현재 `ck3-mod` 폴더 전체를 자신의 운영체제에 맞는 CK3 모드 폴더로 복사합니다.

#### 🍎 macOS
```bash
~/Documents/Paradox Interactive/Crusader Kings III/mod/ck3-tts-companion
```

#### 🪟 Windows
```text
C:\Users\<사용자명>\Documents\Paradox Interactive\Crusader Kings III\mod\ck3-tts-companion
```

---

## 2. 런처에서 모드 활성화

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

## 4. 🎮 인게임 사용법 및 지원 기능

- **이벤트 낭독**: 이벤트 창이 팝업되면 **`F` 키**를 누르거나 모드가 제공하는 스피커 아이콘을 클릭합니다.
- **궁정(Royal Court) 알현실**:
  - 알현실 3D 엔진의 특수성을 고려하여 **수동 낭독 (단축키: F)**으로 지원합니다.
  - 알현실을 닫거나 궁정 주최를 종료하면 진행 중이던 오디오가 **즉시 깨끗하게 정지(`STOP`)**됩니다.
- **디버그 클린 UI**:
  - `-debug_mode` 활성화 시 캐릭터 창 등에 거슬리게 노출되는 보라색 디버그 툴팁, DNA 모디파이어, 지도 좌표, 디버그 버튼(`Copy DNA`, `aiwatch` 등)을 깔끔하게 숨겨 몰입감을 보장합니다.
- **오디오 드라마 모드 연동**:
  - 지문은 중세 사관, 등장인물 대사는 남/여 전용 보이스로 분기되어 한 편의 오디오 드라마처럼 실감나게 낭독됩니다.
