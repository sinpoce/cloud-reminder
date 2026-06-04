import { useEffect, useState } from "react";
import { Activity as ActivityIcon, RefreshCw, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { Delivery, ChannelType } from "../lib/types";
import { browserTimezone, formatDateTime, relativeTime } from "../lib/format";
import { Badge, Button, EmptyState, PageLoader } from "../components/ui";
import { ConfirmDialog } from "../components/Modal";
import { ChannelIcon } from "../components/ChannelIcon";
import { useToast } from "../components/Toast";

export function Activity() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const toast = useToast();
  const tz = browserTimezone();

  async function onClear() {
    setClearing(true);
    try {
      await api.clearDeliveries();
      setDeliveries([]);
      setConfirmClear(false);
      toast("success", "发送记录已清空");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "清空失败");
    } finally {
      setClearing(false);
    }
  }

  const load = (initial = false) => {
    if (!initial) setRefreshing(true);
    return api
      .deliveries(60)
      .then(setDeliveries)
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">最近的推送记录（最多 60 条）。</p>
        <div className="flex items-center gap-2">
          {deliveries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => setConfirmClear(true)}
            >
              清空
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />}
            onClick={() => load()}
          >
            刷新
          </Button>
        </div>
      </div>

      {deliveries.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon className="h-6 w-6" />}
          title="暂无发送记录"
          description="当提醒触发后，每次推送都会记录在这里。"
        />
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {deliveries.map((d) => (
            <div key={d.id} className="flex items-center gap-3.5 p-4">
              {d.channel_type ? (
                <ChannelIcon type={d.channel_type as ChannelType} size="sm" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-elevated">
                  <ActivityIcon className="h-4 w-4 text-muted" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {d.reminder_title ?? "（已删除的提醒）"}
                </p>
                <p className="truncate text-xs text-muted">
                  {d.status === "failed" && d.detail ? d.detail : formatDateTime(d.created_at, tz)}
                </p>
              </div>

              <span className="hidden text-xs text-muted sm:block">
                {relativeTime(d.created_at)}
              </span>

              {d.status === "success" ? (
                <Badge tone="success">
                  <CheckCircle2 className="h-3 w-3" /> 成功
                </Badge>
              ) : (
                <Badge tone="danger">
                  <XCircle className="h-3 w-3" /> 失败
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={onClear}
        loading={clearing}
        title="清空发送记录"
        message="确定清空所有发送记录吗？此操作不可撤销。"
      />
    </div>
  );
}
