// 临时验证脚本：竞技场 syncMode（wait-all / free）
const BASE = 'http://127.0.0.1:3399';
const get = async (p) => (await fetch(BASE + p)).json();
const post = async (p, body) =>
  (await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json();

async function scenario(mode) {
  const room = 'SYNC_' + mode + '_' + Date.now();
  const qs = await get('/api/banks/10/questions');
  const q = qs.find((x) => x.options.some((o) => o.isCorrect));
  await post('/api/arena/session/start', { roomId: room, bankId: 10, durationSec: 120, syncMode: mode });
  await post('/api/arena/question/push', { roomId: room, questionId: q.id, roundNo: 1 });

  // 甲作答
  await post('/api/arena/ingest', { roomId: room, username: '甲', option: 'A' });
  const s1 = await get(`/api/arena/state?roomId=${room}&viewer=${encodeURIComponent('甲')}`);
  console.log('[%s] 甲答完 → reveal=%s selfAnswered=%s (participants=%s answered=%s)',
    mode, s1.reveal ? '已揭晓' : '未揭晓', s1.selfAnswered, s1.participants, s1.answeredCount);

  // 乙作答
  await post('/api/arena/ingest', { roomId: room, username: '乙', option: 'B' });
  const s2 = await get(`/api/arena/state?roomId=${room}&viewer=${encodeURIComponent('甲')}`);
  console.log('[%s] 乙也答完 → reveal=%s (participants=%s answered=%s)',
    mode, s2.reveal ? '已揭晓' : '未揭晓', s2.participants, s2.answeredCount);

  return { mode, afterSelf: !!s1.reveal, afterBoth: !!s2.reveal, syncModeInState: s2.syncMode };
}

(async () => {
  const free = await scenario('free');
  const wait = await scenario('wait-all');

  console.log('--- 断言 ---');
  console.log('free: 自己答完即揭晓:', free.afterSelf ? 'PASS' : 'FAIL');
  console.log('wait-all: 自己答完不揭晓:', !wait.afterSelf ? 'PASS' : 'FAIL');
  console.log('wait-all: 双方答完才揭晓:', wait.afterBoth ? 'PASS' : 'FAIL');
  console.log('state 透出 syncMode:', free.syncModeInState === 'free' && wait.syncModeInState === 'wait-all' ? 'PASS' : 'FAIL');
})();
