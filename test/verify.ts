import { resolveCk3LogPath, getCandidateLogPaths } from "@/main/pathResolver";
import { parseCk3LogLine } from "@/main/textSanitizer";
import { synthesizeWithEdgeTts } from "@/main/ttsService";
import type { AppSettings } from "@/shared/types";

/**
 * 프로젝트 핵심 모듈 기능 검증 스크립트
 */
const runVerification = async (): Promise<void> => {
   console.log("=== [1] OS 경로 자동 감지 검증 ===");
   const candidates = getCandidateLogPaths();
   console.log("예상 경로 목록:", candidates);
   const resolved = resolveCk3LogPath();
   console.log("탐지된 최종 경로:", resolved);

   console.log("\n=== [2] 텍스트 정제기(Sanitizer) 검증 ===");
   const sampleRawLine =
      "[00:15:23][jomini_script_system.cpp:241]: [CK3_TTS] 붉은 늑대의 난|||#bold 폐하#!, 국경의 @skill_martial_icon! 반란군이 [TOOLTIP:MODIFIER,10,morale]진격하고 있습니다!#!";
   const parsed = parseCk3LogLine(sampleRawLine);
   console.log("파싱 결과:", parsed);

   if (!parsed || parsed.title !== "붉은 늑대의 난") {
      throw new Error("파서 검증 실패: 제목이 올바르지 않습니다.");
   }

   const expectedContent = "폐하, 국경의 반란군이 진격하고 있습니다!";
   if (parsed.content !== expectedContent) {
      throw new Error(
         `파서 검증 실패: 정제된 내용(${parsed.content})이 예상과 다릅니다.`,
      );
   }
   console.log("✅ 텍스트 정제 및 파서 검증 통과!");

   console.log("\n=== [3] Edge-TTS 한국어 음성 합성 검증 ===");
   const dummySettings: AppSettings = {
      provider: "edge",
      edgeVoice: "ko-KR-SunHiNeural",
      geminiApiKey: "",
      geminiVoice: "Aoede",
      geminiSystemPrompt: "",
      speechRate: "+0%",
      speechVolume: "+0%",
      customLogPath: null,
      isAutoPlayEnabled: true,
      geminiModel: "gemini-3.8-flash-lite-tts",
   };

   const ttsResult = await synthesizeWithEdgeTts(
      "크루세이더 킹즈 음성 테스트 성공",
      dummySettings,
   );
   console.log("TTS 합성 MIME:", ttsResult.mimeType);
   console.log("TTS 오디오 Base64 길이:", ttsResult.audioBase64.length);

   if (ttsResult.audioBase64.length < 100) {
      throw new Error("TTS 합성 데이터가 너무 작습니다.");
   }
   console.log("✅ Edge-TTS 한국어 합성 검증 통과!");

   console.log("\n🎉 모든 단위 검증이 성공적으로 완료되었습니다!");
};

runVerification().catch((err: unknown) => {
   console.error("❌ 검증 중 오류 발생:", err);
   process.exit(1);
});
