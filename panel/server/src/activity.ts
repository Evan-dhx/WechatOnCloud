// 实例微信消息活动监测：为主平台（ENGKPI）的「新微信消息通知」提供数据源。
// 原理：微信 4.x 数据库加密、读不出未读数，但收到/发出消息都会即时落库（实测 mtime 更新
// 延迟秒级、空闲时纹丝不动），故以「实例内微信消息库最新 mtime」（见 docker.ts
// instanceDbActivity）作为实例级「有新消息活动」信号。主平台后端以管理员身份轮询
// GET /api/instances/activity，对比 lastActivityAt 前进即生成通知事件。
import { listInstances } from './store.js';
import { instanceDbActivity, instanceRuntime } from './docker.js';

const SCAN_INTERVAL_MS = 5_000;

// instanceId → 最新消息库 mtime（epoch 秒，浮点；缺省 0 = 尚未采到）
const activities = new Map<string, number>();

async function scanOnce(): Promise<void> {
  for (const inst of listInstances()) {
    try {
      // 容器没在跑就不 exec 了（docker exec 对停机容器直接报错，徒增噪音）
      if ((await instanceRuntime(inst)) !== 'running') continue;
      const mt = await instanceDbActivity(inst);
      if (mt > 0) activities.set(inst.id, mt);
    } catch {
      // 单实例探测失败不影响其他实例；轮询噪音不值得进面板日志，静默
    }
  }
}

export function startActivityMonitor(): void {
  void scanOnce(); // 启动先采一轮基线，端点立即可用
  setInterval(() => void scanOnce(), SCAN_INTERVAL_MS).unref();
}

// 全部实例的活动快照（供 /api/instances/activity；未采到的实例 lastActivityAt=0）
export function instanceActivityList(): { id: string; name: string; lastActivityAt: number }[] {
  return listInstances().map((i) => ({
    id: i.id,
    name: i.name,
    lastActivityAt: activities.get(i.id) || 0,
  }));
}
