import { Button, Group, Loader, NativeSelect, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useSyncExternalStore } from "react";
import type { BrowserAiHost, AiSettings as Settings } from "./ai-host";
import { tr } from "./i18n";
import { ModelDownloadProgress } from "./ModelDownloadProgress";
import type { ModelDownloadManager } from "./model-download";
import { TimedPasswordInput } from "./TimedPasswordInput";

export function AiSettings({
  value,
  onChange,
  disabled,
  onRelease,
  downloads,
  host,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
  disabled: boolean;
  onRelease: () => void;
  downloads: ModelDownloadManager;
  host: BrowserAiHost;
}) {
  const model = useSyncExternalStore(host.subscribe, host.getSnapshot);
  return (
    <div className="settings-models">
      <fieldset>
        <section className="settings-group">
          <h2>{tr("AgentPlan助手")}</h2>
          <div className="settings-card">
            <Stack gap="md" py={20}>
              <NativeSelect
                label={tr("模型来源")}
                value={value.assistantProvider}
                disabled={disabled}
                data={[
                  { value: "auto", label: tr("自动（OpenAI → Anthropic → 本地）") },
                  { value: "openai", label: "OpenAI" },
                  { value: "anthropic", label: "Anthropic" },
                  { value: "local", label: tr("本地模型") },
                ]}
                onChange={(e) =>
                  onChange({
                    ...value,
                    assistantProvider: e.currentTarget.value as Settings["assistantProvider"],
                  })
                }
              />
              <Text size="sm" c="dimmed">
                {tr(
                  "没有配置 API Key 时使用本地模型。连接设置保存在此浏览器中，API Key 不写入流程文件。",
                )}
              </Text>
              {(["openai", "anthropic"] as const).map((provider) => (
                <Stack key={provider} gap="sm">
                  <Text fw={600}>{provider === "openai" ? "OpenAI" : "Anthropic"}</Text>
                  <TimedPasswordInput
                    label="API Key"
                    autoComplete="off"
                    value={value[provider].apiKey}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [provider]: { ...value[provider], apiKey: e.currentTarget.value },
                      })
                    }
                  />
                  <TextInput
                    label="Base URL"
                    value={value[provider].baseURL}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [provider]: { ...value[provider], baseURL: e.currentTarget.value },
                      })
                    }
                  />
                  <TextInput
                    label={tr("模型 ID")}
                    placeholder={tr("填写该服务提供的模型 ID")}
                    value={value[provider].model}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        [provider]: { ...value[provider], model: e.currentTarget.value },
                      })
                    }
                  />
                </Stack>
              ))}
            </Stack>
          </div>
        </section>
        <section className="settings-group">
          <h2>{tr("本地模型")}</h2>
          <div className="settings-card">
            <div className="settings-row">
              <div>
                <strong>{tr("允许按需下载")}</strong>
                <p>{tr("免费本地模型约 1.44 GB 权重，另需运行库；后续复用缓存。")}</p>
              </div>
              <Switch
                aria-label={tr("允许按需下载")}
                checked={value.allowLocalDownload}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...value, allowLocalDownload: e.currentTarget.checked })
                }
              />
            </div>
            <div className="settings-row">
              <div>
                <strong>{tr("模型内存")}</strong>
                <p>
                  {tr(
                    "本地模型使用设备 WebGPU，不需要 API Key。后续复用缓存；并非所有手机都支持。取消本地调用会释放模型。",
                  )}
                </p>
              </div>
              <Button variant="light" onClick={onRelease}>
                {tr("释放本地模型内存")}
              </Button>
            </div>
            <div className="settings-row">
              <div>
                <strong>{tr("后台初始化")}</strong>
                <p>{tr("提前初始化本地模型，缩短首次对话等待；会占用设备内存。")}</p>
              </div>
              <Switch
                aria-label={tr("后台初始化")}
                checked={value.backgroundInitialization}
                disabled={disabled || !value.allowLocalDownload}
                onChange={(e) =>
                  onChange({ ...value, backgroundInitialization: e.currentTarget.checked })
                }
              />
            </div>
            <Group gap="xs" role="status" mb="md" align="center">
              {model.status === "initializing" && <Loader size="sm" />}
              <Text size="sm">
                {tr(
                  {
                    idle: "本地模型尚未初始化",
                    initializing: "正在初始化本地模型，可能需要几分钟，请耐心等待。",
                    ready: "本地模型已就绪。",
                    error: "本地模型初始化失败",
                  }[model.status],
                )}
              </Text>
            </Group>
            {model.error && (
              <Text c="red" size="sm" role="alert" mb="md">
                {model.error}
              </Text>
            )}
            <ModelDownloadProgress manager={downloads} settings />
          </div>
        </section>
      </fieldset>
    </div>
  );
}
