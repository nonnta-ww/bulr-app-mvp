/**
 * ローカル dev サーバのポート (candidate 3020 / business 3021 / admin 3022) を解放する。
 *
 * なぜ必要か:
 *   各アプリは `next dev -p 30xx` とポートを明示指定して起動する。`-p` を明示すると
 *   Next.js は空きポートへフォールバックせず、ポートが埋まっていると `EADDRINUSE`
 *   で即失敗する。ターミナルを乱暴に閉じた / OOM クラッシュした `next dev` は
 *   `next-server` 子プロセスを孤児として残し、ポートを掴んだまま次の `pnpm dev`
 *   を弾く。そのとき `pnpm dev:clean` でポートを取り戻す。
 *
 * 使い方: `pnpm dev:clean`  (その後 `pnpm dev`)
 */
import { execFileSync } from 'node:child_process';

const PORTS = [
  { port: 3020, label: 'candidate' },
  { port: 3021, label: 'business' },
  { port: 3022, label: 'admin' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 指定 TCP ポートで LISTEN しているプロセス PID を返す。空きなら空配列。 */
function listeningPids(port) {
  try {
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))];
  } catch {
    // 該当なしのとき lsof は非ゼロ終了する = ポートは単に空き。
    return [];
  }
}

/** PID がまだ生存しているか (シグナル 0 は存在確認のみで何も送らない)。 */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

let freedCount = 0;

for (const { port, label } of PORTS) {
  const pids = listeningPids(port).map(Number);
  if (pids.length === 0) {
    console.log(`  ${port} (${label}) — already free`);
    continue;
  }

  // まず SIGTERM で行儀よく落とす。
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* すでに終了済み */
    }
  }
  await sleep(1200);

  // SIGTERM で死ななかったものは SIGKILL で確実に落とす。
  for (const pid of pids.filter(isAlive)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* すでに終了済み */
    }
  }

  freedCount += pids.length;
  console.log(`  ${port} (${label}) — freed (pid ${pids.join(', ')})`);
}

console.log(
  freedCount > 0
    ? `\n✓ ${freedCount} 件のプロセスを解放しました。\`pnpm dev\` を実行できます。`
    : '\n✓ ポートはすでに空いています。`pnpm dev` を実行できます。',
);
