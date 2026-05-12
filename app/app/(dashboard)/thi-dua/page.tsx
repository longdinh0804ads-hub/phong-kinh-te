import Link from "next/link";
import { requireAuth } from "@/lib/session";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
  DEPARTMENT_LABELS,
  ROLE_LABELS,
} from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Trophy,
  Medal,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calculateLeaderboard,
  type Period,
  type UserScore,
} from "@/lib/leaderboard-scoring";

const PERIODS: { value: Period; label: string }[] = [
  { value: "this-week", label: "Tuần này" },
  { value: "this-month", label: "Tháng này" },
  { value: "this-quarter", label: "Quý này" },
  { value: "this-year", label: "Năm nay" },
];

const BADGE_META: Record<
  string,
  { label: string; bg: string; text: string; icon: any }
> = {
  GOLD: { label: "Vàng", bg: "bg-amber-100", text: "text-amber-800", icon: Trophy },
  SILVER: { label: "Bạc", bg: "bg-slate-100", text: "text-slate-700", icon: Medal },
  BRONZE: { label: "Đồng", bg: "bg-orange-100", text: "text-orange-800", icon: Award },
  TOP_10: { label: "Top 10", bg: "bg-blue-50", text: "text-blue-700", icon: Sparkles },
  AT_RISK: {
    label: "Cần cải thiện",
    bg: "bg-red-50",
    text: "text-red-700",
    icon: AlertTriangle,
  },
};

export default async function ThiDuaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: Period; dept?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;
  const period: Period = params.period || "this-month";

  // Scope theo role:
  //  - TP/PTP: toàn phòng (có thể filter dept)
  //  - TBP: chỉ dept mình quản lý
  //  - CV/NV: toàn phòng nhưng highlight rank của mình
  const isFullScope = isTopLeader(user.role);
  let scopeDepts: string[] = [];
  if (isDeptManager(user.role)) {
    scopeDepts = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
  } else if (!isFullScope && params.dept) {
    // CV/NV không tự filter được dept
  } else if (isFullScope && params.dept) {
    scopeDepts = [params.dept];
  }

  const { scores, period: periodInfo } = await calculateLeaderboard({
    period,
    departments: scopeDepts.length > 0 ? scopeDepts : undefined,
  });

  // Stats tổng
  const totalParticipants = scores.filter((s) => s.totalAssigned > 0).length;
  const totalCompleted = scores.reduce(
    (s, x) => s + x.completedEarly + x.completedOnTime + x.completedLate,
    0
  );
  const totalOverdue = scores.reduce((s, x) => s + x.overdueOpen, 0);
  const avgPoints =
    totalParticipants > 0
      ? scores.reduce((s, x) => s + (x.totalAssigned > 0 ? x.points : 0), 0) / totalParticipants
      : 0;

  const myScore = scores.find((s) => s.userId === user.id);

  // Top 3 + rest
  const top3 = scores.filter((s) => s.rank <= 3 && s.totalAssigned > 0);
  const rest = scores.filter((s) => s.rank > 3);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bảng xếp hạng thi đua"
        description={`Xếp hạng theo điểm hiệu quả - ${periodInfo.label}${
          scopeDepts.length > 0
            ? ` - Bộ phận ${scopeDepts.map((d) => DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS]).join(", ")}`
            : ""
        }`}
      />

      {/* Filter period + dept */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground font-medium">Kỳ thi đua:</span>
            <div className="flex gap-1 flex-wrap">
              {PERIODS.map((p) => {
                const active = period === p.value;
                const href = `/thi-dua?period=${p.value}${params.dept ? `&dept=${params.dept}` : ""}`;
                return (
                  <Link
                    key={p.value}
                    href={href}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-md border transition-colors whitespace-nowrap",
                      active
                        ? "bg-primary text-primary-foreground border-primary font-semibold shadow-sm"
                        : "hover:bg-accent border-input"
                    )}
                  >
                    {p.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {isFullScope && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Bộ phận:</span>
              <div className="flex gap-1 flex-wrap">
                <Link
                  href={`/thi-dua?period=${period}`}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md border",
                    !params.dept
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent border-input"
                  )}
                >
                  Toàn phòng
                </Link>
                {Object.entries(DEPARTMENT_LABELS).map(([k, v]) => (
                  <Link
                    key={k}
                    href={`/thi-dua?period=${period}&dept=${k}`}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md border",
                      params.dept === k
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-accent border-input"
                    )}
                  >
                    {v}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats tổng */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Tham gia" value={totalParticipants} sub="cán bộ" />
        <Stat label="Hoàn thành" value={totalCompleted} sub="nhiệm vụ" icon={CheckCircle2} />
        <Stat
          label="Quá hạn"
          value={totalOverdue}
          sub="nhiệm vụ"
          icon={AlertTriangle}
          dangerous={totalOverdue > 0}
        />
        <Stat label="Điểm TB" value={avgPoints.toFixed(1)} sub="/ cán bộ" icon={Sparkles} />
      </div>

      {/* My rank card (cho người dùng tự xem rank) */}
      {myScore && myScore.totalAssigned > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <div className="text-3xl font-bold text-primary">#{myScore.rank}</div>
              <div className="flex-1">
                <div className="font-semibold">Vị trí của bạn</div>
                <div className="text-sm text-muted-foreground">
                  {myScore.points} điểm · {myScore.completedEarly + myScore.completedOnTime + myScore.completedLate} hoàn thành ·
                  {myScore.overdueOpen > 0 ? ` ${myScore.overdueOpen} quá hạn ·` : ""}
                  {" "}Tỷ lệ đúng hạn {Math.round(myScore.onTimeRate * 100)}%
                </div>
              </div>
              {myScore.badge && <BadgePill badge={myScore.badge} />}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Podium - Top 3 */}
      {top3.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-3 items-end">
              {/* Silver - 2nd */}
              {top3[1] ? (
                <PodiumCard score={top3[1]} highlight={top3[1].userId === user.id} height="h-32" />
              ) : (
                <div />
              )}
              {/* Gold - 1st - tallest */}
              {top3[0] ? (
                <PodiumCard score={top3[0]} highlight={top3[0].userId === user.id} height="h-40" />
              ) : (
                <div />
              )}
              {/* Bronze - 3rd */}
              {top3[2] ? (
                <PodiumCard score={top3[2]} highlight={top3[2].userId === user.id} height="h-28" />
              ) : (
                <div />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full leaderboard table */}
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {scores.filter((s) => s.totalAssigned > 0).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Chưa có dữ liệu nhiệm vụ trong kỳ này.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-2 w-16">Hạng</th>
                  <th className="py-2 px-2">Cán bộ</th>
                  <th className="py-2 px-2 text-center">Điểm</th>
                  <th className="py-2 px-2 text-center" title="Hoàn thành sớm">
                    🟢 Sớm
                  </th>
                  <th className="py-2 px-2 text-center" title="Hoàn thành đúng hạn">
                    🔵 Đúng
                  </th>
                  <th className="py-2 px-2 text-center" title="Hoàn thành trễ">
                    🟡 Trễ
                  </th>
                  <th className="py-2 px-2 text-center" title="Quá hạn chưa xong">
                    🔴 Quá hạn
                  </th>
                  <th className="py-2 px-2 text-center">% Đúng hạn</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {scores
                  .filter((s) => s.totalAssigned > 0)
                  .map((s) => {
                    const isMe = s.userId === user.id;
                    return (
                      <tr
                        key={s.userId}
                        className={cn(
                          "border-b hover:bg-muted/20",
                          isMe && "bg-primary/5 font-medium",
                          s.rank <= 3 && "bg-amber-50/30"
                        )}
                      >
                        <td className="py-2 px-2">
                          <RankCell rank={s.rank} />
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex flex-col">
                            <span>
                              {s.name}
                              {isMe && (
                                <span className="ml-2 text-xs text-primary">(bạn)</span>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {s.position} · {ROLE_LABELS[s.role]}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-semibold">
                          <span className={s.points < 0 ? "text-destructive" : ""}>
                            {s.points}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center text-emerald-700">
                          {s.completedEarly || "-"}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {s.completedOnTime || "-"}
                        </td>
                        <td className="py-2 px-2 text-center text-amber-700">
                          {s.completedLate || "-"}
                        </td>
                        <td className="py-2 px-2 text-center text-red-700">
                          {s.overdueOpen || "-"}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <OnTimeBar rate={s.onTimeRate} />
                        </td>
                        <td className="py-2 px-2">
                          {s.badge && <BadgePill badge={s.badge} compact />}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Người chưa có nhiệm vụ */}
      {(() => {
        const noTask = scores.filter((s) => s.totalAssigned === 0);
        if (noTask.length === 0) return null;
        return (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground">
                <strong>{noTask.length} cán bộ</strong> chưa có nhiệm vụ trong kỳ này:{" "}
                {noTask.map((s) => s.name).join(", ")}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Cách tính điểm */}
      <Card>
        <CardContent className="pt-4 pb-4 text-xs text-muted-foreground space-y-1">
          <div className="font-medium text-foreground mb-1">📊 Cách tính điểm:</div>
          <div>• Hoàn thành SỚM (trước hạn &gt;1 ngày): <strong className="text-emerald-700">+5</strong> điểm</div>
          <div>• Hoàn thành ĐÚNG HẠN: <strong>+3</strong> điểm</div>
          <div>• Hoàn thành TRỄ: <strong className="text-amber-700">+1</strong> điểm</div>
          <div>• QUÁ HẠN chưa hoàn thành: <strong className="text-red-700">-3</strong> điểm</div>
          <div>• Hệ số ưu tiên: Khẩn cấp ×1.5 · Cao ×1.2 · Thường ×1.0 · Thấp ×0.8</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============== Sub components ==============

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  dangerous,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: any;
  dangerous?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={cn("text-2xl font-bold mt-1", dangerous && "text-destructive")}>
              {value}
            </div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          {Icon && (
            <Icon
              className={cn(
                "h-5 w-5",
                dangerous ? "text-destructive" : "text-muted-foreground"
              )}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RankCell({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700">
        🥇
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-700">
        🥈
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-700">
        🥉
      </span>
    );
  return <span className="text-muted-foreground font-mono">#{rank}</span>;
}

function BadgePill({ badge, compact }: { badge: string; compact?: boolean }) {
  const meta = BADGE_META[badge];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
        meta.bg,
        meta.text,
        compact && "text-[10px]"
      )}
    >
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function OnTimeBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : pct >= 30 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs w-9 text-right">{pct}%</span>
    </div>
  );
}

function PodiumCard({
  score,
  highlight,
  height,
}: {
  score: UserScore;
  highlight: boolean;
  height: string;
}) {
  const medal = score.rank === 1 ? "🥇" : score.rank === 2 ? "🥈" : "🥉";
  const bgGradient =
    score.rank === 1
      ? "from-amber-200/60 to-amber-100/30 border-amber-300"
      : score.rank === 2
      ? "from-slate-200/60 to-slate-100/30 border-slate-300"
      : "from-orange-200/60 to-orange-100/30 border-orange-300";

  return (
    <div
      className={cn(
        "rounded-lg border bg-gradient-to-b p-3 text-center flex flex-col justify-end",
        bgGradient,
        height,
        highlight && "ring-2 ring-primary"
      )}
    >
      <div className="text-3xl mb-1">{medal}</div>
      <div className="font-semibold text-sm truncate" title={score.name}>
        {score.name}
      </div>
      <div className="text-xs text-muted-foreground truncate">{score.position}</div>
      <div className="font-bold text-lg mt-1">{score.points} đ</div>
    </div>
  );
}
