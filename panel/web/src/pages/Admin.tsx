import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import { api, APP_LABELS, appProfile, type PanelUser, type InstanceWithStatus, type VolEntry, type AppType, type VersionInfo } from '../api';
import { InstanceIcon, ICON_CHOICES } from '../AppIcon';
import { useUI, PasswordInput } from '../ui';
import { useAuth } from '../auth';

const BUSY_PHASES = ['downloading', 'extracting', 'installing'];

function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const MenuIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

// 折叠菜单的展開箭头
const CaretIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// 數據卷文件浏览器用的小圖標（線性 SVG，統一描邊风格，替代渲染不一致的 emoji）
const svgIcon = (children: JSX.Element, size = 16) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const FolderIcon = svgIcon(<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, 18);
const FileIcon = svgIcon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </>,
  18,
);
const DownloadIcon = svgIcon(
  <>
    <path d="M12 3v12" />
    <path d="M7 11l5 5 5-5" />
    <path d="M5 21h14" />
  </>,
);
const EditIcon = svgIcon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </>,
);
const TrashIcon = svgIcon(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
  </>,
);

// 友好空狀態：圆形圖標 + 标题 + 說明 + 可选引导按钮（沿用首页 .empty-state 样式）
function EmptyState({ icon, title, sub, action }: { icon: string; title: string; sub?: string; action?: JSX.Element }) {
  return (
    <div className="empty-state">
      <div className="empty-blob">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

const RELEASES_URL = 'https://github.com/Gloridust/WechatOnCloud/releases';

const DIAG_RANGE_OPTIONS = [
  { key: '24h', label: '24 小時' },
  { key: '7d', label: '7 天' },
  { key: '30d', label: '30 天' },
  { key: '1y', label: '1 年' },
];

// 「診斷與日誌」（仅管理员）：单实例「日誌」只記錄該实例日誌；這里一键打包全局——系統信息 +
// 面板運維日誌 + 全部实例容器狀態/日誌 + 容器清單，便于排查部署/創建卡死/黑屏不可用等問題。
function DiagnosticsSection() {
  const [range, setRange] = useState('24h');
  const exportBundle = () => {
    // tar.gz 带 content-disposition: attachment，用隐藏 <a> 觸發下載（带同源 cookie），不离開页面。
    const a = document.createElement('a');
    a.href = api.diagnosticsUrl(range);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <>
      <div className="section-row" style={{ marginTop: 22 }}>
        <span className="section-title">診斷與日誌</span>
      </div>
      <div className="settings-block">
        <p className="s-desc">打包系統/Docker 信息 + 面板全局日誌 + 各实例容器狀態与日誌 + 容器清單，用于排查部署、創建卡死、黑屏不可用、升級失敗等問題。</p>
        <div className="s-field">
          <span className="field-label">時間範圍</span>
          <div className="chip-row">
            {DIAG_RANGE_OPTIONS.map((r) => (
              <button key={r.key} className={'chip chip-toggle' + (range === r.key ? ' on' : '')} onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-actions">
          <button className="btn btn-primary s-btn" onClick={exportBundle}>
            导出診斷包
          </button>
          <a className="btn-text" href={api.panelLogUrl(range)} target="_blank" rel="noreferrer">
            查看面板日誌 ›
          </a>
        </div>
        <p className="s-foot">导出當前選定範圍内的日誌（.tar.gz）。超過一年的日誌自動清理；診斷包不含密码 / 密鑰等敏感信息。</p>
      </div>
    </>
  );
}

// 「關於」：显示真实構建版本号 + 檢測新版（後台已每 6h 查 Docker Hub/GHCR；這里读缓存并可手動重查）。
function AboutSection({ isAdmin }: { isAdmin: boolean }) {
  const { toast, confirm } = useUI();
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [outdatedInst, setOutdatedInst] = useState(0); // 鏡像落後的实例数（提示"更新面板≠更新实例"）
  const [remoteNewer, setRemoteNewer] = useState(false); // 远端有新实例鏡像（本地還没拉）

  useEffect(() => {
    api.getVersion().then(setInfo).catch(() => {});
    if (isAdmin)
      api
        .upgradeStatus()
        .then((s) => {
          setOutdatedInst(s.outdatedCount);
          // 没有任何实例时不提示"实例鏡像有新版"（全新安裝的噪聲）
          setRemoteNewer(s.remoteNewer === true && s.instances.length > 0);
        })
        .catch(() => {});
  }, [isAdmin]);

  // 一鍵更新面板：拉新鏡像 + 派生 helper 容器重建 woc-panel（數據保留，带失敗回滚）。
  // 觸發後面板會被重建、本連接短暫中斷，約 20s 後自動刷新到新版本。
  const selfUpdate = async () => {
    const ok = await confirm({
      title: info?.isDev ? '升級到正式版？' : '一鍵更新面板？',
      body: `将拉取最新${info?.isDev ? '正式發布' : ''}鏡像并重建面板容器（數據/登錄保留），約十幾秒、期間面板會短暫重啟，完成後自動刷新。${info?.latest ? `\n目標版本：${info.latest}` : ''}`,
      confirmText: info?.isDev ? '升級' : '更新',
    });
    if (!ok) return;
    setUpdating(true);
    try {
      const r = await api.selfUpdatePanel();
      toast(r.message || '已開始更新，面板将重啟，请稍候…', 'ok');
      window.setTimeout(() => window.location.reload(), 25000); // 等新面板起来後自動刷新
    } catch (e: any) {
      toast(e.message || '更新失敗', 'error');
      setUpdating(false);
    }
  };
  // 是否開發版由後端 info.isDev 给出（非正式 vX.Y.Z）。開發版允許一键「升級到正式版」。

  const check = async () => {
    setChecking(true);
    try {
      const r = await api.checkUpdate();
      setInfo(r);
      const rel = /^v?\d+\.\d+\.\d+$/.test(r.current);
      if (r.error) toast('檢查失敗：' + r.error, 'error');
      else if (r.hasUpdate) toast(`發現新版本 ${r.latest}`, 'ok');
      else if (!rel) toast(`最新發布 ${r.latest ?? '未知'}（當前為開發版）`, 'ok');
      else toast('已是最新版本', 'ok');
    } catch (e: any) {
      toast(e.message || '檢查失敗', 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <div className="section-row" style={{ marginTop: 22 }}>
        <span className="section-title">關於</span>
      </div>
      <div className="settings-block">
        <div className="s-title-row">
          <span className="s-app">云微 · WechatOnCloud</span>
          {info?.isDev ? <span className="tag">開發版</span> : info?.hasUpdate ? <span className="tag tag-warn">有新版</span> : null}
        </div>
        <p className="s-line">
          當前版本 <b>{info?.current ?? '…'}</b>
          {info?.latest && !info.error && (info.isDev || info.hasUpdate) && (
            <>
              {' · '}最新{info.isDev ? '發布' : ''} <b>{info.latest}</b>
            </>
          )}
          {info && !info.isDev && !info.hasUpdate && info.latest && !info.error && <>{' · '}已是最新</>}
        </p>
        {info?.hasUpdate && (
          <div className="ver-hint">
            {!isAdmin
              ? '面板有新版本，請聯繫管理員更新。'
              : info.isDev
                ? '當前為開發版（本地 / 自構建）。點「升級到正式版」即可拉取最新正式發布鏡像并重建面板（數據/登錄保留，約十幾秒、期間會短暫重啟，完成後自動刷新）。'
                : '點「一鍵更新面板」即可自動拉新鏡像并重建面板（數據/登錄保留，約十幾秒、期間會短暫重啟，完成後自動刷新）。各实例鏡像可在「管理 → 升級」單獨更新。'}
          </div>
        )}
        {isAdmin && (outdatedInst > 0 || remoteNewer) && (
          <div className="ver-hint">
            ⚠️ {outdatedInst > 0 ? <>另有 <b>{outdatedInst}</b> 个实例的鏡像可升級。</> : <>实例鏡像檢測到新版本。</>}
            <b>更新面板不會自動升級實例</b>（二者是不同鏡像）——请到「管理」用「一鍵升級全部实例」。
          </div>
        )}
        <div className="settings-actions">
          {info?.hasUpdate && isAdmin && (
            <button className="btn btn-primary s-btn" disabled={updating} onClick={selfUpdate}>
              {updating ? '更新中…请稍候' : info.isDev ? '升級到正式版' : '一鍵更新面板'}
            </button>
          )}
          {info?.hasUpdate && (
            <a className="btn-text" href={RELEASES_URL + '/latest'} target="_blank" rel="noreferrer">
              查看新版 ›
            </a>
          )}
          {isAdmin && (
            <button className="btn-text" disabled={checking || updating} onClick={check}>
              {checking ? '檢查中…' : '檢查更新'}
            </button>
          )}
          <a className="btn-text" href={RELEASES_URL} target="_blank" rel="noreferrer">
            發布日誌 ›
          </a>
        </div>
        {info && (
          <p className="s-foot">
            {info.checkedAt ? `上次檢查 ${fmtDate(info.checkedAt)}` : '尚未檢查'}
            {info.source && ` · 來源 ${info.source}`}
            {info.error && ` · ${info.error}`}
          </p>
        )}
      </div>
    </>
  );
}

export default function Admin({ onOpenMenu, onChangePassword }: { onOpenMenu: () => void; onChangePassword: () => void }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { toast, confirm } = useUI();
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [instances, setInstances] = useState<InstanceWithStatus[]>([]);
  const [err, setErr] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingInst, setCreatingInst] = useState(false);
  const [assignInst, setAssignInst] = useState<InstanceWithStatus | null>(null); // 给实例选账户
  const [assignUser, setAssignUser] = useState<PanelUser | null>(null); // 给账户选實例
  const [resetTarget, setResetTarget] = useState<PanelUser | null>(null); // 重置密碼弹窗
  const [renameUserTarget, setRenameUserTarget] = useState<PanelUser | null>(null); // 改用戶名弹窗
  const [deleteInst, setDeleteInst] = useState<InstanceWithStatus | null>(null); // 刪除實例弹窗
  const [renameInst, setRenameInst] = useState<InstanceWithStatus | null>(null); // 重命名实例弹窗
  const [securityInst, setSecurityInst] = useState<InstanceWithStatus | null>(null); // 安全（内存阈值）弹窗
  const [volumeInst, setVolumeInst] = useState<InstanceWithStatus | null>(null); // 數據卷管理弹窗
  const [iconInst, setIconInst] = useState<InstanceWithStatus | null>(null); // 圖標编辑弹窗
  const [acting, setActing] = useState<Record<string, string>>({}); // 实例 id → 進行中的動作文案（啟動中/升級中…）
  // 管理页信息架构：实例 / 用戶 / 系統 三个 Tab（此前 7 个区块一条长滚动，找东西全靠翻）。
  // 记住上次停留的 Tab（sessionStorage），升級轮询等跨 Tab 狀態不受影响——Tab 只控制渲染。
  const [tab, setTabRaw] = useState<'inst' | 'users' | 'system'>(() => {
    const t = sessionStorage.getItem('woc_admin_tab');
    return t === 'users' || t === 'system' ? t : 'inst';
  });
  const setTab = (t: 'inst' | 'users' | 'system') => {
    setTabRaw(t);
    try {
      sessionStorage.setItem('woc_admin_tab', t);
    } catch {
      /* ignore */
    }
  };
  const [upg, setUpg] = useState<{ outdatedCount: number; outdatedIds: string[]; remoteNewer: boolean } | null>(null); // 鏡像落後的实例 + 远端有新版
  const [upgradingAll, setUpgradingAll] = useState(false);
  const [upgProgress, setUpgProgress] = useState(''); // 一鍵升級进度文案（"2/5 · 升級「xxx」…"）
  const pollingRef = useRef(false); // 防止 load() 恢復轮询与手動发起的轮询並存
  // 未使用的舊數據卷（来自之前删实例时未勾選"彻底清除"）：允許複用以繼承聊天記錄，或顯式刪除。
  const [orphanVols, setOrphanVols] = useState<{ name: string; createdAt?: string; sizeBytes?: number }[]>([]);
  // 殘留 woc-wx-* 容器（runInstance 启动失敗遺留的 Created 容器等）：占着卷名讓删卷报 409。
  const [orphanConts, setOrphanConts] = useState<{ id: string; name: string; status: string; volumeName?: string }[]>([]);
  const setAct = (id: string, label: string | null) =>
    setActing((a) => {
      const n = { ...a };
      if (label) n[id] = label;
      else delete n[id];
      return n;
    });

  const subs = users.filter((u) => u.role !== 'admin');
  const timer = useRef<number | undefined>(undefined);

  const load = async () => {
    if (!isAdmin) return; // 子账号无管理數據權限，管理页只给改密
    try {
      const [{ users }, { instances }] = await Promise.all([api.listUsers(), api.listInstances()]);
      setUsers(users);
      setInstances(instances);
    } catch (e: any) {
      setErr(e.message);
    }
    // 孤儿卷 / 殘留容器独立 catch：docker 接口失敗不应阻塞用戶/实例视圖
    try {
      const { volumes } = await api.listOrphanVolumes();
      setOrphanVols(volumes);
    } catch {
      /* ignore */
    }
    try {
      const s = await api.upgradeStatus();
      setUpg({ outdatedCount: s.outdatedCount, outdatedIds: s.outdatedIds, remoteNewer: s.remoteNewer === true });
      // 刷新页面/重进管理页时發現後台一鍵升級還在跑 → 恢復進度條与輪詢
      if (s.upgradeAll.running && !pollingRef.current) void pollUpgradeAll();
    } catch {
      /* ignore：更新檢測失敗不影响管理页 */
    }
    try {
      const { containers } = await api.listOrphanContainers();
      setOrphanConts(containers);
    } catch {
      /* ignore */
    }
  };

  const removeOrphanCont = async (c: { id: string; name: string }) => {
    const ok = await confirm({
      title: `刪除殘留容器「${c.name}」？`,
      body: '此容器不属于任何登記实例（多为創建失敗遺留）。刪除不會动數據卷，删後才能繼續清理同名舊數據卷。',
      danger: true,
      confirmText: '刪除容器',
    });
    if (!ok) return;
    try {
      await api.deleteOrphanContainer(c.id);
      toast('已刪除殘留容器，可繼續清理數據卷', 'ok');
      setOrphanConts((cs) => cs.filter((x) => x.id !== c.id));
      // 容器走了之後，原本被它占着的卷可能從"被引用"翻成"孤儿"，刷新一次
      try {
        const { volumes } = await api.listOrphanVolumes();
        setOrphanVols(volumes);
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      toast(e.message || '刪除失敗', 'error');
    }
  };

  const removeOrphanVol = async (name: string) => {
    const ok = await confirm({
      title: `徹底刪除數據卷「${name}」？`,
      body: '該卷里保存的微信本地數據（聊天記錄缓存等）将永久消失，无法恢復。',
      danger: true,
      confirmText: '徹底刪除',
    });
    if (!ok) return;
    try {
      await api.deleteOrphanVolume(name);
      toast('已刪除數據卷', 'ok');
      setOrphanVols((vs) => vs.filter((v) => v.name !== name));
    } catch (e: any) {
      toast(e.message || '刪除失敗', 'error');
    }
  };

  useEffect(() => {
    load();
    return () => window.clearTimeout(timer.current);
  }, []);

  // 安裝/更新進行中时轮询进度
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (instances.some((i) => BUSY_PHASES.includes(i.wechat.phase))) timer.current = window.setTimeout(load, 1500);
    return () => window.clearTimeout(timer.current);
  }, [instances]);

  const trigger = async (inst: InstanceWithStatus, kind: 'install' | 'update') => {
    try {
      await (kind === 'install' ? api.instanceWechatInstall(inst.id) : api.instanceWechatUpdate(inst.id));
      setInstances((list) =>
        list.map((i) =>
          i.id === inst.id ? { ...i, wechat: { ...i.wechat, phase: 'downloading', percent: -1, message: '正在准备…' } } : i,
        ),
      );
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 1000);
      toast(kind === 'install' ? '已開始下載微信' : '已開始更新', 'ok');
    } catch (e: any) {
      toast(e.message || '操作失敗', 'error');
    }
  };

  const start = async (inst: InstanceWithStatus) => {
    setAct(inst.id, '啟動中…');
    try {
      await api.instanceStart(inst.id);
      toast('实例已启动', 'ok');
      await load();
    } catch (e: any) {
      toast(e.message || '启动失敗', 'error');
    } finally {
      setAct(inst.id, null);
    }
  };

  const lifecycle = async (inst: InstanceWithStatus, kind: 'stop' | 'restart' | 'upgrade') => {
    const label = kind === 'stop' ? '停止中…' : kind === 'upgrade' ? '升級中…' : '重啟中…';
    setAct(inst.id, label);
    try {
      if (kind === 'upgrade') {
        // 升級是後端异步任务（拉鏡像可能數分鍾）：发起後轮询 upgradingIds 直到完成，
        // 避免同步等待被反代掐断而误报失敗（舊版实况）。
        await api.instanceUpgrade(inst.id);
        toast('已開始升級：拉取最新鏡像并重建（後台進行）…', 'info');
        for (let i = 0; i < 400; i++) {
          await new Promise((res) => setTimeout(res, 3000));
          try {
            const s = await api.upgradeStatus();
            if (!s.upgradingIds.includes(inst.id)) {
              // 完成後据"是否仍落後"给结论（失敗详情在面板日誌）
              if (s.outdatedIds.includes(inst.id)) toast('升級未完成，请查看「面板日誌」', 'error');
              else toast('已升級到最新鏡像并重啟', 'ok');
              break;
            }
          } catch {
            /* 面板短暫不可达，繼續轮询 */
          }
        }
      } else {
        await (kind === 'stop' ? api.instanceStop(inst.id) : api.instanceRestart(inst.id));
        toast(kind === 'stop' ? '已停止' : '已重啟', 'ok');
      }
      await load();
    } catch (e: any) {
      toast(e.message || '操作失敗', 'error');
    } finally {
      setAct(inst.id, null);
    }
  };

  // 轮询一鍵升級进度直到完成（3s 一次；異常網絡下最多轮 30 分钟兜底退出）。
  // 发起升級与"刷新页面後發現後台還在跑"（load 里檢測）都走這里。
  const pollUpgradeAll = async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setUpgradingAll(true);
    try {
      for (let i = 0; i < 600; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        try {
          const s = await api.upgradeStatus();
          const p = s.upgradeAll;
          if (p.running) {
            // 拉取阶段 total=0，只显示 phase；进入逐个升級後显示 n/total
            setUpgProgress(p.total ? `${p.done}/${p.total}${p.phase ? ` · ${p.phase}` : ''}` : p.phase || '…');
            continue;
          }
          if (p.total === 0) toast('所有实例已是最新鏡像', 'ok');
          else
            toast(
              `升級完成：成功 ${p.total - p.failed}${p.failed ? `、失敗 ${p.failed}（看面板日誌）` : ''}`,
              p.failed ? 'error' : 'ok',
            );
          break;
        } catch {
          /* 面板短暫不可达（不影响後台任务），繼續轮询 */
        }
      }
      await load();
    } finally {
      pollingRef.current = false;
      setUpgradingAll(false);
      setUpgProgress('');
    }
  };

  // 一鍵升級全部"鏡像落後"的实例。後端异步執行（先統一拉鏡像、再逐个重建，可能數分鍾），
  // 這里发起後轮询 upgrade-status 里的进度，避免单个请求悬死（舊版同步等待被反馈"一直卡死"）。
  const upgradeAll = async () => {
    const n = upg?.outdatedCount || 0;
    const ok = await confirm({
      title: n ? `升級全部 ${n} 个可升級實例？` : '拉取新版鏡像并升級全部实例？',
      body: '後台先拉取最新实例鏡像，再逐个重建（數據保留）；期間這些实例會短暫重连，可离開本页。',
      confirmText: '全部升級',
    });
    if (!ok) return;
    setUpgradingAll(true);
    try {
      await api.upgradeAllInstances();
      toast('已開始升級（後台進行，可离開本页）…', 'info');
      await pollUpgradeAll();
    } catch (e: any) {
      toast(e.message || '升級失敗', 'error');
      setUpgradingAll(false);
      setUpgProgress('');
    }
  };

  const instName = (id: string) => instances.find((i) => i.id === id)?.name || id;
  const usersForInstance = (id: string) => subs.filter((u) => u.allowedInstances.includes(id));

  const toggle = async (u: PanelUser) => {
    try {
      await api.setDisabled(u.id, !u.disabled);
      toast(u.disabled ? '已启用' : '已禁用', 'ok');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    load();
  };
  const removeUser = async (u: PanelUser) => {
    const ok = await confirm({ title: `刪除子账号「${u.username}」？`, body: '該账户将无法再登錄。', danger: true, confirmText: '刪除' });
    if (!ok) return;
    try {
      await api.deleteUser(u.id);
      toast('已刪除', 'ok');
    } catch (e: any) {
      toast(e.message, 'error');
    }
    load();
  };

  return (
    <div className="ws-page">
      <header className="ws-head">
        <button className="ws-menu" onClick={onOpenMenu} aria-label="菜单">
          {MenuIcon}
        </button>
        <span className="ws-title">{isAdmin ? '管理' : '設置'}</span>
      </header>

      <main className="content">
        {err && <div className="error">{err}</div>}

        {/* 三 Tab 信息架构：实例（日常） / 用戶（账号權限） / 系統（維護+診斷+關於）。
            牛奶布艺分段選擇器：凹槽 + 浮起的选中胶囊；角标點提示"該 Tab 里有事要处理"。 */}
        {isAdmin && (
          <div className="seg-tabs" role="tablist">
            {(
              [
                { key: 'inst', label: '實例', dot: !!(upg?.outdatedCount || upg?.remoteNewer) && instances.length > 0 },
                { key: 'users', label: '用戶', dot: false },
                { key: 'system', label: '系統', dot: orphanConts.length + orphanVols.length > 0 },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={'seg-tab' + (tab === t.key ? ' active' : '')}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.dot && <span className="seg-dot" />}
              </button>
            ))}
          </div>
        )}

        {isAdmin && tab === 'inst' && (
          <>
            <div className="section-row">
              <span className="section-title">实例</span>
              <button className="btn-text" onClick={() => setCreatingInst(true)}>
                + 新建實例
              </button>
            </div>
            {!!(upg?.outdatedCount || upg?.remoteNewer) && instances.length > 0 && (
              <div className="upgrade-banner">
                <span>
                  {upg.outdatedCount ? (
                    <>
                      有 <b>{upg.outdatedCount}</b> 个实例的鏡像可升級到最新版。
                    </>
                  ) : (
                    <>檢測到实例鏡像有新版本可拉取。</>
                  )}
                  <span className="muted small">（更新面板不會自動升級實例，二者是不同鏡像）</span>
                </span>
                <button className="btn btn-primary s-btn" disabled={upgradingAll} onClick={upgradeAll}>
                  {upgradingAll ? `升級中 ${upgProgress || '…'}` : '一鍵升級全部实例'}
                </button>
              </div>
            )}
            {instances.length === 0 ? (
              <EmptyState
                icon="🖥️"
                title="還没有实例"
                sub="新建一個實例（微信 / Chromium 瀏覽器），進入後即可在瀏覽器裡使用"
                action={
                  <button className="btn btn-primary" onClick={() => setCreatingInst(true)}>
                    ＋ 新建實例
                  </button>
                }
              />
            ) : (
              <div className="inst-grid">
                {instances.map((inst) => (
                  <InstanceAdminCard
                    key={inst.id}
                    inst={inst}
                    outdated={!!upg?.outdatedIds.includes(inst.id)}
                    userCount={usersForInstance(inst.id).length}
                    acting={acting[inst.id]}
                    onEnter={() => nav(`/i/${inst.id}`)}
                    onTrigger={trigger}
                    onStart={() => start(inst)}
                    onStop={() => lifecycle(inst, 'stop')}
                    onRestart={() => lifecycle(inst, 'restart')}
                    onUpgrade={() => lifecycle(inst, 'upgrade')}
                    onRename={() => setRenameInst(inst)}
                    onAssign={() => setAssignInst(inst)}
                    onDelete={() => setDeleteInst(inst)}
                    onSecurity={() => setSecurityInst(inst)}
                    onVolume={() => setVolumeInst(inst)}
                    onIcon={() => setIconInst(inst)}
                  />
                ))}
              </div>
            )}

          </>
        )}

        {isAdmin && tab === 'users' && (
          <>
            <div className="section-row">
              <span className="section-title">子账号</span>
              <button className="btn-text" onClick={() => setCreatingUser(true)}>
                + 新建子賬號
              </button>
            </div>
            {subs.length === 0 ? (
              <EmptyState
                icon="👥"
                title="還没有子账号"
                sub="子賬號是登錄這套面板的身份，可按賬號分配能訪問哪些實例"
                action={
                  <button className="btn btn-primary" onClick={() => setCreatingUser(true)}>
                    ＋ 新建子賬號
                  </button>
                }
              />
            ) : (
              <div className="inst-grid">
                {subs.map((u) => (
                  <div key={u.id} className="inst-card">
                    <div className="inst-head">
                      <span className="inst-name">{u.username}</span>
                      {u.disabled ? <span className="tag tag-off">已禁用</span> : <span className="tag tag-on">正常</span>}
                    </div>
                    <div className="inst-sub">{u.allowedInstances.length > 0 ? `可訪問 ${u.allowedInstances.length} 個實例` : '未分配實例'}</div>
                    {u.allowedInstances.length > 0 && (
                      <div className="chip-row" style={{ marginTop: 8 }}>
                        {u.allowedInstances.map((id) => (
                          <span key={id} className="chip chip-static">
                            {instName(id)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="inst-admin-links">
                      <button className="btn-text" onClick={() => setAssignUser(u)}>
                        可访问實例
                      </button>
                      <button className="btn-text" onClick={() => setRenameUserTarget(u)}>
                        改名
                      </button>
                      <button className="btn-text" onClick={() => toggle(u)}>
                        {u.disabled ? '启用' : '禁用'}
                      </button>
                      <button className="btn-text" onClick={() => setResetTarget(u)}>
                        重置密碼
                      </button>
                      <button className="btn-text danger" onClick={() => removeUser(u)}>
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {isAdmin && tab === 'system' && (
          <>
            {orphanConts.length > 0 && (
              <>
                <div className="section-row">
                  <span className="section-title">殘留容器</span>
                  <span className="muted small">不属于任何登記实例（多为創建失敗遺留）；它们占着數據卷名，需先清理它们才能刪除同名數據卷。</span>
                </div>
                <div className="inst-grid">
                  {orphanConts.map((c) => (
                    <div key={c.id} className="inst-card">
                      <div className="inst-head">
                        <span className="inst-name" style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.name}</span>
                        <span className="tag tag-off">{c.status || 'unknown'}</span>
                      </div>
                      {c.volumeName && (
                        <div className="inst-sub" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          占用卷：{c.volumeName}
                        </div>
                      )}
                      <div className="inst-admin-links">
                        <button className="btn-text danger" onClick={() => removeOrphanCont(c)}>
                          刪除容器
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {orphanVols.length > 0 && (
              <>
                <div className="section-row" style={{ marginTop: 22 }}>
                  <span className="section-title">未使用的數據卷</span>
                  <span className="muted small">刪除實例时未勾選「彻底清除」會保留下来；可在新建实例时複用以繼承聊天記錄。</span>
                </div>
                <div className="inst-grid">
                  {orphanVols.map((v) => (
                    <div key={v.name} className="inst-card">
                      <div className="inst-head">
                        <span className="inst-name" style={{ fontFamily: 'monospace', fontSize: 13 }}>{v.name}</span>
                      </div>
                      <div className="inst-sub">
                        {v.createdAt ? `創建于 ${v.createdAt.slice(0, 10)}` : '創建时间未知'}
                        {typeof v.sizeBytes === 'number' ? `　·　${(v.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
                      </div>
                      <div className="inst-admin-links">
                        <button className="btn-text" onClick={() => setCreatingInst(true)} title="去「新建实例」對話框，在「數據卷」下拉里選擇複用此卷">
                          複用为新實例
                        </button>
                        <button className="btn-text danger" onClick={() => removeOrphanVol(v.name)}>
                          徹底刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* 账号：所有人（含子账号）都能在此改密。管理员放「用戶」Tab，子账号无 Tab 直接显示 */}
        {(!isAdmin || tab === 'users') && (
          <>
            <div className="section-row" style={{ marginTop: isAdmin ? 22 : 0 }}>
              <span className="section-title">账号</span>
            </div>
            <div className="inst-grid">
              <div className="inst-card">
                <div className="inst-head">
                  <span className="inst-name">{user?.username}</span>
                  {isAdmin ? <span className="tag">管理员</span> : <span className="tag tag-on">子账号</span>}
                </div>
                <div className="inst-sub">{isAdmin ? '可訪問全部實例' : `可訪問 ${user?.allowedInstances.length ?? 0} 個實例`}</div>
                <div className="inst-actions">
                  <button className="btn btn-primary inst-act-wide" onClick={onChangePassword}>
                    修改密碼
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {isAdmin && tab === 'system' && <DiagnosticsSection />}
        {(!isAdmin || tab === 'system') && <AboutSection isAdmin={isAdmin} />}
      </main>

      {creatingUser && (
        <CreateUser
          instances={instances}
          onClose={() => setCreatingUser(false)}
          onDone={() => {
            setCreatingUser(false);
            load();
          }}
        />
      )}
      {creatingInst && (
        <CreateInstance
          subs={subs}
          onClose={() => setCreatingInst(false)}
          onDone={() => {
            setCreatingInst(false);
            load();
          }}
        />
      )}
      {assignInst && (
        <AssignUsers
          inst={assignInst}
          subs={subs}
          onClose={() => setAssignInst(null)}
          onDone={() => {
            setAssignInst(null);
            load();
          }}
        />
      )}
      {assignUser && (
        <AssignInstances
          user={assignUser}
          instances={instances}
          onClose={() => setAssignUser(null)}
          onDone={() => {
            setAssignUser(null);
            load();
          }}
        />
      )}
      {resetTarget && (
        <ResetPassword
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => {
            setResetTarget(null);
            toast('密码已重置', 'ok');
          }}
        />
      )}
      {renameUserTarget && (
        <RenameUser
          user={renameUserTarget}
          onClose={() => setRenameUserTarget(null)}
          onDone={() => {
            setRenameUserTarget(null);
            toast('用戶名已修改', 'ok');
            load();
          }}
        />
      )}
      {deleteInst && (
        <DeleteInstance
          inst={deleteInst}
          onClose={() => setDeleteInst(null)}
          onDone={() => {
            setDeleteInst(null);
            toast('实例已刪除', 'ok');
            load();
          }}
        />
      )}
      {renameInst && (
        <RenameInstance
          inst={renameInst}
          onClose={() => setRenameInst(null)}
          onDone={() => {
            setRenameInst(null);
            toast('已重命名', 'ok');
            load();
          }}
        />
      )}
      {securityInst && (
        <InstanceSecurity
          inst={securityInst}
          onClose={() => setSecurityInst(null)}
          onDone={() => {
            toast('已保存安全阈值', 'ok');
            load();
          }}
        />
      )}
      {volumeInst && (
        <VolumeManager inst={volumeInst} onClose={() => setVolumeInst(null)} onChanged={load} />
      )}
      {iconInst && (
        <InstanceIconEditor
          inst={iconInst}
          onClose={() => setIconInst(null)}
          onDone={() => {
            toast('已更新圖標', 'ok');
            load();
          }}
        />
      )}
    </div>
  );
}

function RenameInstance({ inst, onClose, onDone }: { inst: InstanceWithStatus; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(inst.name);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.renameInstance(inst.id, name.trim());
      onDone();
    } catch (e: any) {
      setErr(e.message || '重命名失敗');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>重命名实例</h2>
        <input className="input" placeholder="实例名稱" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || name.trim() === inst.name}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function RenameUser({ user, onClose, onDone }: { user: PanelUser; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(user.username);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.renameUser(user.id, name.trim());
      onDone();
    } catch (e: any) {
      setErr(e.message || '改名失敗');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>修改用戶名</h2>
        <input className="input" placeholder="新用戶名（3-20 位字母/数字/下划線）" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="muted small" style={{ marginTop: 6 }}>改的是登錄用戶名；改後保持登錄，下次用新用戶名登錄。</div>
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || name.trim() === user.username}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: PanelUser; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && pw !== confirm;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (pw !== confirm) {
      setErr('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    try {
      await api.resetUser(user.id, pw);
      onDone();
    } catch (e: any) {
      setErr(e.message || '重置失敗');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>重置「{user.username}」的密码</h2>
        <PasswordInput placeholder="新密码（至少 6 位）" autoComplete="new-password" value={pw} onChange={setPw} />
        <PasswordInput placeholder="再次输入新密码" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {(mismatch || err) && <div className="error">{mismatch ? '两次输入的新密码不一致' : err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || pw.length < 6 || pw !== confirm}>
            重置
          </button>
        </div>
      </form>
    </div>
  );
}

// 「安全」弹窗：编辑某实例的内存安全阀（soft / hard）。
// soft：超過且无人在远程會話时主动重啟（柔和自愈，不打扰）
// hard：超過即强制重啟（无视會話，防止 OOM）
// 留空 = 使用面板全局默认（来自 env）。
function InstanceSecurity({ inst, onClose, onDone }: { inst: InstanceWithStatus; onClose: () => void; onDone: () => void }) {
  const { toast, confirm } = useUI();
  const [data, setData] = useState<import('../api').MemLimits | null>(null);
  // 输入字段：空串 = "使用默认"（→ 提交时映射为 null）
  const [softStr, setSoftStr] = useState('');
  const [hardStr, setHardStr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const regenMachineId = async () => {
    const ok = await confirm({
      title: '重置該实例的设备 ID？',
      body: '會生成一个全新的设备标识（machine-id）并重啟实例，相當于"换一台新设备"。微信需要重新扫码登錄。适用于該账号被微信判定设备风险、登錄即被强制退出的情况。',
      danger: true,
      confirmText: '重置并重啟',
    });
    if (!ok) return;
    setRegenBusy(true);
    try {
      await api.regenMachineId(inst.id);
      toast('已重置设备 ID，实例正在重啟，请稍後重新扫码登錄', 'ok');
      onClose();
      onDone();
    } catch (e: any) {
      toast(e.message || '重置失敗', 'error');
    } finally {
      setRegenBusy(false);
    }
  };

  // 首次加载 + 每 5s 刷新 currentMB（运行实例的实时内存）
  useEffect(() => {
    let alive = true;
    const fetchOnce = async (initial: boolean) => {
      try {
        const d = await api.getInstanceMemLimits(inst.id);
        if (!alive) return;
        setData(d);
        if (initial) {
          setSoftStr(d.soft == null ? '' : String(d.soft));
          setHardStr(d.hard == null ? '' : String(d.hard));
          setLoaded(true);
        }
      } catch (e: any) {
        if (alive && initial) {
          setErr(e?.message || '读取失敗');
          setLoaded(true);
        }
      }
    };
    fetchOnce(true);
    const t = window.setInterval(() => fetchOnce(false), 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [inst.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const parse = (s: string): number | null => {
      const t = s.trim();
      if (t === '') return null;
      const n = Number(t);
      if (!Number.isInteger(n)) throw new Error('阈值需为整数（MiB）');
      return n;
    };
    let s: number | null;
    let h: number | null;
    try {
      s = parse(softStr);
      h = parse(hardStr);
    } catch (e: any) {
      setErr(e.message);
      return;
    }
    if (s != null && h != null && s >= h) {
      setErr('soft 阈值需小于 hard 阈值');
      return;
    }
    setBusy(true);
    try {
      await api.setInstanceMemLimits(inst.id, s, h);
      onDone();
      onClose();
    } catch (e: any) {
      setErr(e.message || '保存失敗');
    } finally {
      setBusy(false);
    }
  };

  const resetToDefault = () => {
    setSoftStr('');
    setHardStr('');
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ maxWidth: 460 }}>
        <h2>安全 · {inst.name}</h2>
        {!loaded ? (
          <div className="muted small" style={{ padding: '14px 0' }}>读取中…</div>
        ) : !data ? (
          <div className="error">{err || '读取失敗'}</div>
        ) : (
          <>
            <div className="muted small" style={{ lineHeight: 1.6 }}>
              當 KasmVNC/Xvnc 长跑泄漏内存时，面板的 watchdog 會自動重啟实例。两档阈值（单位 MiB）：
              <br />
              <b>soft</b>：超過且<b>无人在远程會話</b>时柔和重啟（不打扰使用者）。
              <br />
              <b>hard</b>：超過即<b>强制重啟</b>，无视會話，防止 OOM 拖垮宿主。
            </div>

            <div className="security-status">
              <div className="security-row">
                <span>當前内存</span>
                <b>{data.currentMB > 0 ? `${data.currentMB} MiB` : '—'}</b>
              </div>
              <div className="security-row">
                <span>面板默认</span>
                <span className="muted">soft {data.defaultSoft} · hard {data.defaultHard}</span>
              </div>
              <div className="security-row">
                <span>巡检间隔</span>
                <span className="muted">
                  {data.watchdogEnabled ? `每 ${data.intervalSec}s` : 'watchdog 已關闭'}
                </span>
              </div>
            </div>

            <div className="field-label" style={{ marginTop: 12 }}>soft 阈值（留空 = 用默认 {data.defaultSoft}）</div>
            <input
              className="input"
              inputMode="numeric"
              placeholder={`${data.defaultSoft}`}
              value={softStr}
              onChange={(e) => setSoftStr(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <div className="field-label" style={{ marginTop: 8 }}>hard 阈值（留空 = 用默认 {data.defaultHard}）</div>
            <input
              className="input"
              inputMode="numeric"
              placeholder={`${data.defaultHard}`}
              value={hardStr}
              onChange={(e) => setHardStr(e.target.value.replace(/[^0-9]/g, ''))}
            />
            <div className="muted small" style={{ marginTop: 6 }}>
              提示：日常活跃内存約 1500 MiB；soft 建议略高于此（如 2000），hard 建议远低于宿主可用内存（如 3000~4000）。
            </div>

            <div className="field-label" style={{ marginTop: 16 }}>设备身份（machine-id）</div>
            <div className="muted small" style={{ lineHeight: 1.6 }}>
              微信會用设备标识做风控。若該账号被判定<b>设备风险</b>、登錄後被强制退出且反复循环，
              可重置为一个全新的唯一设备 ID（相當于换台新设备），再重新扫码登錄。會重啟該实例。
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
              onClick={regenMachineId}
              disabled={regenBusy || busy}
            >
              {regenBusy ? '重置中…' : '↻ 重置设备 ID 并重啟'}
            </button>

            {err && <div className="error">{err}</div>}
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-text" onClick={resetToDefault} disabled={busy}>
            ↺ 恢復默认
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || !loaded || !data}>
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteInstance({ inst, onClose, onDone }: { inst: InstanceWithStatus; onClose: () => void; onDone: () => void }) {
  const [purge, setPurge] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      await api.deleteInstance(inst.id, purge);
      onDone();
    } catch (e: any) {
      setErr(e.message || '刪除失敗');
      setBusy(false);
    }
  };
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <h2>刪除實例「{inst.name}」？</h2>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
          容器會被移除。默认保留聊天記錄（數據卷），之後可重建同名实例恢復。
        </div>
        <label className={'purge-opt' + (purge ? ' on' : '')} onClick={() => setPurge((v) => !v)}>
          <span className="purge-check">{purge ? '✓' : ''}</span>
          <span>
            同时永久刪除聊天記錄（數據卷）
            <span className="muted small" style={{ display: 'block' }}>不可恢復，请谨慎勾選</span>
          </span>
        </label>
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={submit}>
            {purge ? '连數據一起刪除' : '刪除實例'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 管理页的实例卡片：含微信版本管理（下載/更新）+ 重命名/分配/刪除
function InstanceAdminCard({
  inst,
  outdated,
  userCount,
  acting,
  onEnter,
  onTrigger,
  onStart,
  onStop,
  onRestart,
  onUpgrade,
  onRename,
  onAssign,
  onDelete,
  onSecurity,
  onVolume,
  onIcon,
}: {
  inst: InstanceWithStatus;
  outdated?: boolean;
  userCount: number;
  acting?: string;
  onEnter: () => void;
  onTrigger: (inst: InstanceWithStatus, kind: 'install' | 'update') => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onUpgrade: () => void;
  onRename: () => void;
  onAssign: () => void;
  onDelete: () => void;
  onSecurity: () => void;
  onVolume: () => void;
  onIcon: () => void;
}) {
  const wx = inst.wechat;
  const busy = BUSY_PHASES.includes(wx.phase);
  const installed = wx.installed && wx.phase !== 'downloading';
  const offline = inst.runtime !== 'running';
  const working = !!acting || busy; // 生命周期操作中 或 微信下載/更新中 → 锁住卡片
  const [menuOpen, setMenuOpen] = useState(false); // 「管理」菜单是否展開（悬浮层，不占文档流）
  const menuRef = useRef<HTMLDivElement>(null);
  // 悬浮下拉：點击菜单外部时關闭
  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [menuOpen]);

  const profile = appProfile(inst.appType);

  let badge: { text: string; cls: string };
  if (acting) badge = { text: '处理中', cls: 'tag-busy' };
  else if (offline) badge = { text: inst.runtime === 'missing' ? '未創建' : '已停止', cls: 'tag-off' };
  else if (busy) badge = { text: '处理中', cls: 'tag-busy' };
  else if (installed) badge = { text: '在線', cls: 'tag-on' };
  else badge = { text: '待安裝', cls: 'tag-warn' };

  let sub: string;
  if (acting) sub = acting;
  else if (busy) sub = wx.percent >= 0 ? `${wx.message || '处理中'} ${wx.percent}%` : wx.message || '请稍候…';
  else if (wx.phase === 'error') sub = wx.message || '操作失敗，可重试';
  else if (offline) sub = inst.runtime === 'missing' ? '容器尚未創建' : '容器已停止';
  else if (installed) sub = wx.version ? `${profile.label} ${wx.version}` : `${profile.label}已就绪`;
  else sub = `${profile.label}尚未安裝`;

  return (
    <div className={'inst-card' + (menuOpen ? ' open-menu' : '')}>
      <div className="inst-head">
        <span className="inst-name" title={inst.name}>
          {inst.name}
        </span>
        <span className={'tag ' + badge.cls}>{badge.text}</span>
      </div>
      {/* 次要元數據独占一行（可换行），不再和名字挤在标题行导致名字被截断、徽标竖排换行 */}
      {((outdated && !acting) || inst.imageVersion) && (
        <div className="inst-meta">
          {outdated && !acting && (
            <span className="tag tag-warn" title="該实例的鏡像落後于最新版，點「升級實例」可更新">
              可升級
            </span>
          )}
          {inst.imageVersion && (
            <span
              className="tag tag-muted"
              title={/^\d+\.\d+\.\d+$/.test(inst.imageVersion) ? '該实例當前运行的鏡像版本' : '本地自構建鏡像（无發布版本号，显示鏡像短 id）'}
            >
              鏡像 {/^\d+\.\d+\.\d+$/.test(inst.imageVersion) ? `v${inst.imageVersion}` : inst.imageVersion.slice(0, 8)}
            </span>
          )}
        </div>
      )}
      <div className="inst-sub">
        {sub}
        {!acting && ` · 可访问 ${userCount} 人`}
      </div>

      {working && (
        <div className="wx-progress">
          <div
            className={'wx-progress-bar' + (acting || wx.percent < 0 ? ' indeterminate' : '')}
            style={!acting && wx.percent >= 0 ? { width: `${wx.percent}%` } : undefined}
          />
        </div>
      )}

      {/* 進行中（升級/重啟/停止/下載）时隐藏所有操作，避免重复點击 */}
      {!working && (
        <>
          <div className="inst-actions">
            {offline ? (
              <button className="btn btn-primary inst-act-wide" onClick={onStart}>
                {inst.runtime === 'missing' ? '創建并启动' : '启动实例'}
              </button>
            ) : (
              <button className="btn btn-primary inst-act-wide" disabled={!installed} onClick={onEnter} title={installed ? '' : '需先下載安裝' + profile.label}>
                進入實例
              </button>
            )}
          </div>

          <div className="inst-menu-wrap" ref={menuRef}>
            <button className={'inst-menu-toggle' + (menuOpen ? ' open' : '')} onClick={() => setMenuOpen((v) => !v)}>
              <span>管理</span>
              <span className="inst-menu-caret">{CaretIcon}</span>
            </button>

            {menuOpen && (
              <div className="inst-menu" onClick={() => setMenuOpen(false)}>
              <div className="inst-menu-group">
                <div className="inst-menu-label">運維</div>
                <div className="inst-menu-items">
                  {!offline && profile.needsInstall && (
                    <button className="btn-text" onClick={() => onTrigger(inst, installed ? 'update' : 'install')}>
                      {installed ? profile.updateLabel : '下載安裝'}
                    </button>
                  )}
                  <button className="btn-text" onClick={onUpgrade} title="拉取最新鏡像并重建（保留聊天記錄）">
                    升級實例
                  </button>
                  {!offline && (
                    <button className="btn-text" onClick={onRestart}>
                      重啟
                    </button>
                  )}
                  {!offline && (
                    <button className="btn-text" onClick={onStop}>
                      停止
                    </button>
                  )}
                </div>
              </div>
              <div className="inst-menu-group">
                <div className="inst-menu-label">設置</div>
                <div className="inst-menu-items">
                  <button className="btn-text" onClick={onRename}>
                    重命名
                  </button>
                  <button className="btn-text" onClick={onAssign}>
                    分配賬戶
                  </button>
                  <button className="btn-text" onClick={() => window.open(api.instanceLogsUrl(inst.id), '_blank')} title="查看实例日誌（含历史：重啟原因 + 上一容器日誌快照，跨重啟保留）">
                    日誌
                  </button>
                  <button className="btn-text" onClick={onSecurity} title="内存阈值自愈">
                    安全
                  </button>
                  <button className="btn-text" onClick={onIcon} title="設置实例圖標：内置圖標 / 上传图片裁剪">
                    圖標
                  </button>
                  <button className="btn-text" onClick={onVolume} title="數據卷：備份/恢復、上传 PC 微信數據、文件管理">
                    數據卷
                  </button>
                </div>
              </div>
              <div className="inst-menu-group inst-menu-danger">
                <div className="inst-menu-items">
                  <button className="btn-text danger" onClick={onDelete}>
                    刪除實例
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 把裁剪区域画到 128px 画布并导出 PNG dataURL（存进 inst.icon）
async function cropToDataUrl(src: string, area: { x: number; y: number; width: number; height: number }): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const SIZE = 128;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  c.getContext('2d')!.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, SIZE, SIZE);
  return c.toDataURL('image/png');
}

// 实例圖標编辑：选内置圖標 / 上传图片裁剪 / 恢復默认。
function InstanceIconEditor({ inst, onClose, onDone }: { inst: InstanceWithStatus; onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [sel, setSel] = useState<string>(inst.icon || ''); // '' = 按应用默认
  const [busy, setBusy] = useState(false);
  const [cropSrc, setCropSrc] = useState(''); // 非空 = 裁剪态
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('请選擇图片文件', 'error');
    if (f.size > 8 * 1024 * 1024) return toast('图片過大（>8MB）', 'error');
    const r = new FileReader();
    r.onload = () => {
      setCropSrc(String(r.result));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    r.readAsDataURL(f);
  };

  const confirmCrop = async () => {
    if (!cropSrc || !area) return;
    try {
      setSel(await cropToDataUrl(cropSrc, area));
      setCropSrc('');
    } catch {
      toast('裁剪失敗', 'error');
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.setInstanceIcon(inst.id, sel || null);
      onDone();
      onClose();
    } catch (e: any) {
      toast(e?.message || '保存失敗', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h2>圖標 · {inst.name}</h2>
        {cropSrc ? (
          <>
            <div className="icon-crop">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, a) => setArea(a)}
              />
            </div>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setCropSrc('')}>返回</button>
              <button type="button" className="btn btn-primary" onClick={confirmCrop}>裁剪并使用</button>
            </div>
          </>
        ) : (
          <>
            <div className="icon-edit-top">
              <InstanceIcon icon={sel || undefined} appType={inst.appType} size={56} radius={14} />
              <div className="muted small">预览（{sel.startsWith('data:') ? '自定义图片' : sel.startsWith('builtin:') ? '内置圖標' : '按应用默认'}）</div>
            </div>
            <div className="field-label">内置圖標</div>
            <div className="icon-grid">
              <button type="button" className={'icon-pick' + (sel === '' ? ' sel' : '')} onClick={() => setSel('')}>
                <InstanceIcon appType={inst.appType} size={38} radius={11} />
                <span>默认</span>
              </button>
              {ICON_CHOICES.map((c) => (
                <button
                  type="button"
                  key={c.key}
                  className={'icon-pick' + (sel === `builtin:${c.key}` ? ' sel' : '')}
                  onClick={() => setSel(`builtin:${c.key}`)}
                >
                  <InstanceIcon icon={`builtin:${c.key}`} size={38} radius={11} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>上传图片并裁剪…</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>保存</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// 數據卷管理（仅管理员）：整卷備份/恢復 + 文件浏览器（浏览/上传/解压/下載/改名/移动/刪除）。
// 主要场景：把 PC 微信數據迁移上来、跨实例迁移、離線備份。全程在「运行中」的实例上操作
// （浏览/改名/刪除靠 docker exec，需容器运行）。整卷恢復會覆盖全部數據，强提示并建议恢復後重啟实例。
function VolumeManager({ inst, onClose, onChanged }: { inst: InstanceWithStatus; onClose: () => void; onChanged: () => void }) {
  const { toast, confirm } = useUI();
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<VolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(''); // 進行中操作文案；非空即禁用界面
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const extractRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const offline = inst.runtime !== 'running'; // 文件浏览需实例运行中

  const join = (a: string, b: string) => (a ? a + '/' + b : b);

  const load = async (p = path) => {
    setLoading(true);
    setErr('');
    try {
      const r = await api.volumeList(inst.id, p);
      setEntries(r.entries);
      setPath(r.path);
    } catch (e: any) {
      setErr(e?.message || '读取失敗');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (offline) {
      setLoading(false);
      return;
    }
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst.id]);

  const sorted = [...entries].sort((a, b) => {
    if ((a.type === 'dir') !== (b.type === 'dir')) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh');
  });
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const segs = path ? path.split('/') : [];

  const run = async (label: string, fn: () => Promise<any>, okMsg?: string, skipReload = false) => {
    setBusy(label);
    try {
      await fn();
      if (okMsg) toast(okMsg, 'ok');
      if (!skipReload) await load();
    } catch (e: any) {
      toast(e?.message || '操作失敗', 'error');
    } finally {
      setBusy('');
    }
  };

  const doMkdir = async () => {
    const name = mkdirName.trim();
    if (!name) return;
    await run('新建中…', () => api.volumeMkdir(inst.id, join(path, name)), '已新建文件夹');
    setMkdirName('');
    setMkdirOpen(false);
  };

  const doRename = async (oldName: string) => {
    const nv = renameVal.trim();
    setRenaming(null);
    if (!nv || nv === oldName) return;
    // 含 / → 视为相對 /config 的目标路径（移动到子目录）；否则同目录改名
    const to = nv.includes('/') ? nv.replace(/^\/+/, '') : join(path, nv);
    await run('处理中…', () => api.volumeMove(inst.id, join(path, oldName), to), '已重命名 / 移动');
  };

  const doDelete = async (en: VolEntry) => {
    const ok = await confirm({
      title: `刪除「${en.name}」？`,
      body: en.type === 'dir' ? '将递归刪除該文件夹下所有内容，不可恢復。' : '刪除後不可恢復。',
      danger: true,
      confirmText: '刪除',
    });
    if (!ok) return;
    await run('刪除中…', () => api.volumeDelete(inst.id, join(path, en.name)), '已刪除');
  };

  const onPick = (kind: 'upload' | 'extract' | 'restore') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (kind === 'restore') {
      const ok = await confirm({
        title: '恢復整卷備份？',
        body: `将用「${file.name}」覆盖該实例 /config 的全部數據（含登錄态、聊天库），不可撤销。建议仅用于本系統导出的備份；恢復後请在卡片上「重啟」实例以加载數據。`,
        danger: true,
        confirmText: '覆盖恢復',
      });
      if (!ok) return;
      await run(`恢復 ${file.name}…`, () => api.volumeRestore(inst.id, file), '恢復完成，请重啟实例以加载數據', true);
      onChanged();
      return;
    }
    if (kind === 'upload') await run(`上传 ${file.name}…`, () => api.volumeUpload(inst.id, path, file), '上传完成');
    else await run(`解压 ${file.name}…`, () => api.volumeExtract(inst.id, path, file), '解压完成');
  };

  const disabled = !!busy;
  const icon = (en: VolEntry) => (en.type === 'dir' ? FolderIcon : FileIcon);

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="card modal vol-modal" onClick={(e) => e.stopPropagation()}>
        <h2>數據卷 · {inst.name}</h2>

        {/* 整卷備份 / 恢復（运行/停止均可用） */}
        <div className="vol-sec">
          <div className="vol-section-label">整卷備份 / 恢復</div>
          <div className="vol-topbar">
            <a className="btn" href={api.volumeBackupUrl(inst.id)} target="_blank" rel="noreferrer">下載整卷備份</a>
            <button className="btn" disabled={disabled} onClick={() => restoreRef.current?.click()}>恢復備份…</button>
            <input ref={restoreRef} type="file" accept=".gz,.tgz,.tar" hidden onChange={onPick('restore')} />
          </div>
          <div className="vol-hint">整卷含聊天記錄，用于跨实例迁移 / 離線備份。</div>
        </div>

        {offline ? (
          <div className="vol-warn">
            实例未运行，文件浏览不可用。可執行上方的整卷備份 / 恢復；要浏览或上传单个文件，请先在卡片上启动实例。
          </div>
        ) : (
          <div className="vol-sec">
            <div className="vol-section-label">文件浏览</div>
            {/* 面包屑 */}
            <div className="vol-crumbs">
              <button className="vol-crumb" disabled={disabled} onClick={() => load('')}>/config</button>
              {segs.map((s, i) => (
                <span key={i}>
                  <span className="vol-sep">/</span>
                  <button className="vol-crumb" disabled={disabled} onClick={() => load(segs.slice(0, i + 1).join('/'))}>
                    {s}
                  </button>
                </span>
              ))}
            </div>

            {/* 工具条 */}
            <div className="vol-tools">
              <button className="btn-text" disabled={disabled} onClick={() => uploadRef.current?.click()}>上传文件</button>
              <button className="btn-text" disabled={disabled} onClick={() => extractRef.current?.click()}>上传并解压</button>
              <button className="btn-text" disabled={disabled} onClick={() => setMkdirOpen((v) => !v)}>新建文件夹</button>
              <button className="btn-text" disabled={disabled} onClick={() => load()}>刷新</button>
              <input ref={uploadRef} type="file" hidden onChange={onPick('upload')} />
              <input ref={extractRef} type="file" accept=".gz,.tgz,.tar" hidden onChange={onPick('extract')} />
            </div>
            {mkdirOpen && (
              <div className="vol-mkdir">
                <input
                  className="input"
                  placeholder="文件夹名"
                  value={mkdirName}
                  autoFocus
                  onChange={(e) => setMkdirName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doMkdir()}
                />
                <button className="btn btn-primary" disabled={disabled || !mkdirName.trim()} onClick={doMkdir}>創建</button>
              </div>
            )}

            {busy && <div className="vol-busy">{busy}</div>}

            {/* 文件列表 */}
            <div className="vol-list">
              {loading ? (
                <div className="muted small" style={{ padding: 16 }}>读取中…</div>
              ) : err ? (
                <div className="error">{err}</div>
              ) : sorted.length === 0 ? (
                <div className="muted small" style={{ padding: 16 }}>{path ? '空目录' : '（无内容）'}</div>
              ) : (
                <>
                  {path && (
                    <button className="vol-row vol-main vol-up" disabled={disabled} onClick={() => load(parent)}>
                      <span className="vol-ic">{FolderIcon}</span>
                      <span className="vol-nm">返回上一级</span>
                    </button>
                  )}
                  {sorted.map((en) => (
                    <div className="vol-row" key={en.name}>
                      {renaming === en.name ? (
                        <input
                          className="input vol-rename"
                          autoFocus
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') doRename(en.name);
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          onBlur={() => doRename(en.name)}
                        />
                      ) : (
                        <button
                          className="vol-main"
                          disabled={disabled}
                          onClick={() => (en.type === 'dir' ? load(join(path, en.name)) : undefined)}
                          style={{ cursor: en.type === 'dir' ? 'pointer' : 'default' }}
                        >
                          <span className={'vol-ic' + (en.type === 'dir' ? ' dir' : '')}>{icon(en)}</span>
                          <span className="vol-nm">{en.name}</span>
                          <span className="vol-meta">
                            {en.type === 'dir' ? '' : fmtBytes(en.size)}
                            {en.mtime ? ` · ${fmtDate(en.mtime)}` : ''}
                          </span>
                        </button>
                      )}
                      <div className="vol-acts">
                        {en.type === 'file' && (
                          <a
                            className="vol-act"
                            title="下載"
                            href={api.volumeDownloadUrl(inst.id, join(path, en.name))}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {DownloadIcon}
                          </a>
                        )}
                        <button
                          className="vol-act"
                          title="重命名 / 移动"
                          disabled={disabled}
                          onClick={() => {
                            setRenameVal(en.name);
                            setRenaming(en.name);
                          }}
                        >
                          {EditIcon}
                        </button>
                        <button className="vol-act danger" title="刪除" disabled={disabled} onClick={() => doDelete(en)}>
                          {TrashIcon}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        <div className="muted small" style={{ marginTop: 10, lineHeight: 1.6 }}>
          PC 微信數據迁移：把數據文件夹打包成 <b>.tar.gz</b>，用「上传并解压」放到對应目录；改动微信正在使用的數據後，重啟实例方可生效。能否解密取决于微信版本与设备绑定，请自行测试。
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>關闭</button>
        </div>
      </div>
    </div>
  );
}

// 通用 chip 多选
function ChipMultiSelect({
  options,
  selected,
  onToggle,
  empty,
}: {
  options: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  empty: string;
}) {
  if (options.length === 0) return <div className="muted small">{empty}</div>;
  return (
    <div className="chip-row chip-row-pick">
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          className={'chip chip-toggle' + (selected.has(o.id) ? ' on' : '')}
          onClick={() => onToggle(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CreateUser({ instances, onClose, onDone }: { instances: InstanceWithStatus[]; onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.createUser(username.trim(), password, [...sel]);
      onDone();
    } catch (e: any) {
      setErr(e.message || '創建失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>新建子账号</h2>
        <input
          className="input"
          placeholder="用戶名（3-20 位字母/数字/下划線）"
          autoCapitalize="off"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <PasswordInput placeholder="初始密码（至少 6 位）" autoComplete="new-password" value={password} onChange={setPassword} />
        <div className="field-label">可访问的微信实例</div>
        <ChipMultiSelect
          options={instances.map((i) => ({ id: i.id, label: i.name }))}
          selected={sel}
          onToggle={(id) => setSel((s) => toggleSet(s, id))}
          empty="暂无实例，可稍後在账户里分配"
        />
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || !username || !password}>
            創建
          </button>
        </div>
      </form>
    </div>
  );
}

// 可創建的应用类型。ready=false 的暂时禁用（即将支持）。Telegram（仅 x86_64）与其它应用暂缓。
const APP_OPTIONS: { type: AppType; desc: string; ready: boolean }[] = [
  { type: 'wechat', desc: '默认', ready: true },
  { type: 'chromium', desc: '浏览器', ready: true },
  { type: 'custom', desc: '即将支持', ready: false },
];

function CreateInstance({ subs, onClose, onDone }: { subs: PanelUser[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [appType, setAppType] = useState<AppType>('wechat');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // 未使用的舊數據卷（之前刪除實例但未勾選「彻底清除」时保留下来的），允許在此複用以繼承聊天記錄。
  const [orphans, setOrphans] = useState<{ name: string; createdAt?: string }[]>([]);
  const [reuse, setReuse] = useState<string>(''); // '' = 不複用，新建空卷

  useEffect(() => {
    let alive = true;
    api
      .listOrphanVolumes()
      .then(({ volumes }) => alive && setOrphans(volumes))
      .catch(() => {
        /* 读取失敗时不阻塞創建：列表为空即可，照常新建空卷 */
      });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.createInstance(name.trim(), [...sel], reuse || undefined, appType);
      onDone();
    } catch (e: any) {
      setErr(e.message || '創建失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>新建实例</h2>
        <div className="field-label">应用类型</div>
        <div className="app-picker">
          {APP_OPTIONS.map((o) => (
            <button
              key={o.type}
              type="button"
              className={'app-pick' + (appType === o.type ? ' sel' : '')}
              disabled={!o.ready}
              title={o.ready ? '' : '即将支持'}
              onClick={() => o.ready && setAppType(o.type)}
            >
              <span className="app-pick-name">{APP_LABELS[o.type]}</span>
              <span className="app-pick-desc">{o.desc}</span>
            </button>
          ))}
        </div>
        <input className="input" placeholder="实例名稱（留空自動命名）" value={name} onChange={(e) => setName(e.target.value)} />
        {appType === 'chromium' && (
          <div className="muted small">Chromium 浏览器随鏡像就绪，創建後直接「进入实例」即可（无需下載安裝）。</div>
        )}
        <div className="field-label">允許訪問的子賬號（管理員預設可訪問全部）</div>
        <ChipMultiSelect
          options={subs.map((u) => ({ id: u.id, label: u.username }))}
          selected={sel}
          onToggle={(id) => setSel((s) => toggleSet(s, id))}
          empty="暂无子账号"
        />
        {orphans.length > 0 && (
          <>
            <div className="field-label" style={{ marginTop: 12 }}>數據卷（可选）</div>
            <select className="input" value={reuse} onChange={(e) => setReuse(e.target.value)}>
              <option value="">新建空卷（全新登錄）</option>
              {orphans.map((v) => (
                <option key={v.name} value={v.name}>
                  複用 · {v.name}
                  {v.createdAt ? `（${v.createdAt.slice(0, 10)} 創建）` : ''}
                </option>
              ))}
            </select>
            <div className="muted small" style={{ marginTop: 4 }}>
              複用舊卷需**用原微信号扫码登錄**才能解密历史消息；用别的号登錄将看不到舊記錄。
            </div>
          </>
        )}
        {err && <div className="error">{err}</div>}
        <div className="muted small" style={{ marginTop: 4 }}>
          創建後拉起一个新的 {APP_LABELS[appType]} 容器；进入实例後點「下載并安裝」，再登錄即可。
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            創建
          </button>
        </div>
      </form>
    </div>
  );
}

function AssignUsers({
  inst,
  subs,
  onClose,
  onDone,
}: {
  inst: InstanceWithStatus;
  subs: PanelUser[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(subs.filter((u) => u.allowedInstances.includes(inst.id)).map((u) => u.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.setInstanceUsers(inst.id, [...sel]);
      onDone();
    } catch (e: any) {
      setErr(e.message || '保存失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>「{inst.name}」可访问账户</h2>
        <ChipMultiSelect
          options={subs.map((u) => ({ id: u.id, label: u.username }))}
          selected={sel}
          onToggle={(id) => setSel((s) => toggleSet(s, id))}
          empty="暂无子账号"
        />
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignInstances({
  user,
  instances,
  onClose,
  onDone,
}: {
  user: PanelUser;
  instances: InstanceWithStatus[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(user.allowedInstances));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.setUserInstances(user.id, [...sel]);
      onDone();
    } catch (e: any) {
      setErr(e.message || '保存失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>{user.username} 可访问实例</h2>
        <ChipMultiSelect
          options={instances.map((i) => ({ id: i.id, label: i.name }))}
          selected={sel}
          onToggle={(id) => setSel((s) => toggleSet(s, id))}
          empty="暂无实例"
        />
        {err && <div className="error">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function toggleSet(s: Set<string>, id: string): Set<string> {
  const next = new Set(s);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
