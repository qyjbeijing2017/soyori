import { Button, Group, Progress, Stack, Text } from "@mantine/core";
import { useSyncExternalStore } from "react";
import { tr } from "./i18n";
import type { ModelDownloadManager } from "./model-download";

export function ModelDownloadProgress({
  manager,
  settings = false,
}: {
  manager: ModelDownloadManager;
  settings?: boolean;
}) {
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  if (!settings && !["downloading", "paused", "error"].includes(state.status)) return null;
  const percent = state.total ? Math.min(100, (state.loaded / state.total) * 100) : 0;
  const status = {
    idle: "尚未下载",
    downloading: "正在下载",
    paused: "下载已暂停",
    stopped: "下载已停止",
    ready: "下载已完成",
    error: "下载失败",
    clearing: "正在清除模型下载",
  }[state.status];
  const controls = (
    <>
      {state.status === "downloading" ? (
        <Button onClick={() => manager.pause()}>{tr("暂停下载")}</Button>
      ) : (
        state.status !== "ready" &&
        state.status !== "clearing" && (
          <Button onClick={() => manager.resume()}>
            {tr(state.loaded ? "继续下载" : "开始下载")}
          </Button>
        )
      )}
      {["downloading", "paused", "error"].includes(state.status) && (
        <Button variant="subtle" onClick={() => manager.stop()}>
          {tr("取消下载")}
        </Button>
      )}
      {settings && state.scope === "tokenizer" && state.status === "ready" && (
        <Button onClick={() => void manager.ensure("model").catch(() => {})}>
          {tr("下载模型权重")}
        </Button>
      )}
    </>
  );
  return (
    <Stack
      gap="xs"
      p={settings ? 0 : "sm"}
      pb={settings ? 20 : "sm"}
      style={{ overflowWrap: "anywhere", minWidth: 0 }}
    >
      <Group justify="space-between" wrap="wrap">
        <Text size="sm" fw={600}>
          {tr("本地模型下载")} · {tr(status)}
        </Text>
        {!settings && controls}
      </Group>
      {settings && (
        <Text size="xs">Qwen3-1.7B{state.scope === "tokenizer" ? ` · ${tr("分词器")}` : ""}</Text>
      )}
      {state.status !== "ready" && (
        <>
          <Progress value={percent} aria-label={tr("下载进度")} />
          <Text size="xs">
            {(state.loaded / 1_000_000).toFixed(1)} / {(state.total / 1_000_000).toFixed(1)} MB ·{" "}
            {percent.toFixed(1)}%
          </Text>
        </>
      )}
      {settings && state.file && (
        <Text size="xs" c="dimmed">
          {state.file}
        </Text>
      )}
      {state.error && (
        <Text size="sm" c="red" role="alert">
          {state.errorKind === "storage-quota"
            ? tr(
                "浏览器存储配额不足。若使用访客或无痕模式，请改用普通窗口。可清除模型下载后重试；此操作不会删除流程和对话。",
              )
            : state.error}
        </Text>
      )}
      {settings && <Group gap="xs">{controls}</Group>}
      {settings && (
        <Text size="xs" c="dimmed">
          {tr(
            "下载分块保存在此浏览器，暂停或停止后可继续；释放会停止下载并释放模型内存，保留下载数据。",
          )}
        </Text>
      )}
    </Stack>
  );
}
