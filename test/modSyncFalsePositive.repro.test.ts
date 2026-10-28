import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { areModDirectoriesIdentical } from "@/main/modSyncService";

describe("모드 최신 버전 동기화 오탐(False Positive) 및 버튼 활성화 버그 재현 테스트", () => {
   it("1. 패러독스 런처/스팀 워크샵이 descriptor.mod의 supported_version이나 줄바꿈(LF/CRLF), path를 변경하더라도 버전과 내부 파일이 같으면 동일(true)로 판정해야 한다", () => {
      const tempRoot = fs.mkdtempSync(
         path.join(os.tmpdir(), "ck3-mod-sync-repro-"),
      );
      const srcDir = path.join(tempRoot, "src-mod");
      const destDir = path.join(tempRoot, "dest-mod");

      try {
         fs.mkdirSync(path.join(srcDir, "gui"), { recursive: true });
         fs.mkdirSync(path.join(destDir, "gui"), { recursive: true });

         // 원본(ck3-mod): CRLF 및 supported_version="*.*.*"
         const srcDescriptor = [
            'version="1.11.4"',
            "tags={",
            '\t"Gameplay"',
            '\t"Sound"',
            "}",
            'name="CK3 Event Voice Reader (TTS Companion)"',
            'picture="thumbnail.png"',
            'supported_version="*.*.*"',
            'remote_file_id="3824371603"',
            "",
         ].join("\r\n");

         // 대상(Steam Workshop / Paradox Launcher): LF 및 supported_version="1.20.1.2"
         const destDescriptor = [
            'version="1.11.4"',
            "tags={",
            '\t"Gameplay"',
            '\t"Sound"',
            "}",
            'name="CK3 Event Voice Reader (TTS Companion)"',
            'picture="thumbnail.png"',
            'supported_version="1.20.1.2"',
            'remote_file_id="3824371603"',
         ].join("\n");

         fs.writeFileSync(
            path.join(srcDir, "descriptor.mod"),
            srcDescriptor,
            "utf-8",
         );
         fs.writeFileSync(
            path.join(destDir, "descriptor.mod"),
            destDescriptor,
            "utf-8",
         );

         // 내부 GUI 파일 (CRLF vs LF 차이 포함)
         fs.writeFileSync(
            path.join(srcDir, "gui", "window_event.gui"),
            "window = {\r\n\tname = \"test\"\r\n}\r\n",
            "utf-8",
         );
         fs.writeFileSync(
            path.join(destDir, "gui", "window_event.gui"),
            "window = {\n\tname = \"test\"\n}\n",
            "utf-8",
         );

         assert.strictEqual(
            areModDirectoriesIdentical(srcDir, destDir),
            true,
            "런처가 descriptor.mod의 supported_version 및 줄바꿈을 변경해도 버전과 실제 모드 파일이 일치하면 true여야 함",
         );
      } finally {
         fs.rmSync(tempRoot, { recursive: true, force: true });
      }
   });

   it("2. 버전이 같더라도 실제 GUI/스크립트 파일 내용이 다르면 false를 반환해야 한다", () => {
      const tempRoot = fs.mkdtempSync(
         path.join(os.tmpdir(), "ck3-mod-sync-diff-"),
      );
      const srcDir = path.join(tempRoot, "src-mod");
      const destDir = path.join(tempRoot, "dest-mod");

      try {
         fs.mkdirSync(path.join(srcDir, "gui"), { recursive: true });
         fs.mkdirSync(path.join(destDir, "gui"), { recursive: true });

         const descriptor = 'version="1.11.4"\nname="CK3 Event Voice Reader (TTS Companion)"\n';
         fs.writeFileSync(path.join(srcDir, "descriptor.mod"), descriptor, "utf-8");
         fs.writeFileSync(path.join(destDir, "descriptor.mod"), descriptor, "utf-8");

         fs.writeFileSync(
            path.join(srcDir, "gui", "window_event.gui"),
            'window = { name = "new_hook" }',
            "utf-8",
         );
         fs.writeFileSync(
            path.join(destDir, "gui", "window_event.gui"),
            'window = { name = "old_hook" }',
            "utf-8",
         );

         assert.strictEqual(
            areModDirectoriesIdentical(srcDir, destDir),
            false,
            "내부 GUI 파일 내용이 실제로 다르면 false여야 함",
         );
      } finally {
         fs.rmSync(tempRoot, { recursive: true, force: true });
      }
   });

   it("3. handleSyncModFiles 완료 후 finally 블록이 checkModSyncStatus의 최신 상태 버튼 비활성화를 다시 덮어쓰지 않아야 한다", () => {
      const mainTsPath = path.resolve(process.cwd(), "src/renderer/main.ts");
      const content = fs.readFileSync(mainTsPath, "utf-8");

      const handleSyncStart = content.indexOf("const handleSyncModFiles");
      assert.ok(handleSyncStart !== -1, "handleSyncModFiles 함수가 존재해야 함");

      const handleSyncBlock = content.slice(handleSyncStart, handleSyncStart + 1800);
      // finally 블록에서 무조건 btnModalSyncMod.disabled = false로 덮어쓰는 패턴이 없어야 함
      const hasUnconditionalResetInFinally =
         /finally\s*\{[\s\S]*?btnModalSyncMod\.disabled\s*=\s*false/.test(
            handleSyncBlock,
         );
      assert.strictEqual(
         hasUnconditionalResetInFinally,
         false,
         "finally 블록에서 무조건 btnModalSyncMod.disabled = false를 호출하면 동기화 완료 직후 버튼이 다시 활성화됨",
      );
   });
});

