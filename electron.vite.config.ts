import childProcess, { type SpawnOptions } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Windows 터미널(Git Bash / PowerShell / CMD)에서 Electron 자식 프로세스의 UTF-8 한글·이모지 로그가
// CONOUT$(CP949)을 거치며 깨지는 현상(Mojibake)을 원천 차단
if (process.platform === 'win32') {
  try {
    // windowsHide: true를 주면 별도 숨김 콘솔이 생성되어 현재 콘솔 코드 페이지가 바뀌지 않으므로 반드시 생략
    childProcess.spawnSync('chcp.com', ['65001'], { stdio: 'ignore' });
  } catch {
    // 비콘솔 환경 무시
  }

  const originalSpawn = childProcess.spawn;
  const patchedSpawn = ((
    command: string,
    argsOrOptions?: readonly string[] | SpawnOptions,
    maybeOptions?: SpawnOptions
  ) => {
    const isArgsArray = Array.isArray(argsOrOptions);
    const args: readonly string[] = isArgsArray ? argsOrOptions : [];
    const options: SpawnOptions =
      (isArgsArray ? maybeOptions : (argsOrOptions as SpawnOptions | undefined)) ?? {};

    const isElectronBinary = /electron(\.exe)?$/i.test(command);
    if (isElectronBinary && options.stdio === 'inherit') {
      const child = originalSpawn(command, args, {
        ...options,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...options.env,
          ELECTRON_NO_ATTACH_CONSOLE: '1',
          FORCE_COLOR: '1'
        }
      });

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        process.stdout.write(chunk);
      });

      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        process.stderr.write(chunk);
      });

      return child;
    }

    return originalSpawn(command, args, options);
  }) as typeof childProcess.spawn;

  childProcess.spawn = patchedSpawn;
  syncBuiltinESMExports();
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve('src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve('src')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src')
      }
    }
  }
});
