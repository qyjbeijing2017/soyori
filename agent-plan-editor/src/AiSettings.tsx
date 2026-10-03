import { Button, Switch, TextInput } from "@mantine/core";
import { useId } from "react";
import type { AiSettings as Settings } from "./ai-host";
import { tr } from "./i18n";

export function AiSettings({
  value,
  onChange,
  disabled,
  onRelease,
}: {
  value: Settings;
  onChange: (value: Settings) => void;
  disabled: boolean;
  onRelease: () => void;
}) {
  const formId = useId();
  return (
    <div className="settings-models">
      <fieldset disabled={disabled}>
        <p className="muted">
          {tr(
            "配置仅保留在当前页面，刷新后清除；密钥不写入流程。API 请求由浏览器直接发送到所填服务地址，服务需支持跨域。",
          )}
        </p>
        <section className="settings-group">
          <h2>{tr("本地模型")}</h2>
          <div className="settings-card">
            <div className="settings-row">
              <div>
                <strong>{tr("首次运行自动下载")}</strong>
                <p>{tr("免费本地模型约 255 MB 权重，另需运行库；后续复用缓存。")}</p>
              </div>
              <Switch
                aria-label={tr("首次运行自动下载")}
                checked={value.allowLocalDownload}
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
          </div>
        </section>
        {(["openai", "anthropic"] as const).map((provider) => (
          <section className="settings-group" key={provider}>
            <h2>{provider === "openai" ? tr("OpenAI / 兼容服务") : "Anthropic"}</h2>
            <div className="settings-card provider-fields">
              <label htmlFor={`${formId}-${provider}-1`}>
                API Key
                <TextInput
                  id={`${formId}-${provider}-1`}
                  type="password"
                  autoComplete="off"
                  value={value[provider].apiKey ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [provider]: { ...value[provider], apiKey: e.target.value },
                    })
                  }
                />
              </label>
              <label htmlFor={`${formId}-${provider}-2`}>
                {tr("默认模型")}
                <TextInput
                  id={`${formId}-${provider}-2`}
                  value={value[provider].model ?? ""}
                  placeholder={tr("填写该服务提供的模型 ID")}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [provider]: { ...value[provider], model: e.target.value },
                    })
                  }
                />
              </label>
              <label htmlFor={`${formId}-${provider}-3`}>
                {tr("服务地址（留空使用官方地址）")}
                <TextInput
                  id={`${formId}-${provider}-3`}
                  type="url"
                  value={value[provider].baseURL ?? ""}
                  placeholder={
                    provider === "openai"
                      ? "https://api.openai.com/v1"
                      : "https://api.anthropic.com"
                  }
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [provider]: { ...value[provider], baseURL: e.target.value },
                    })
                  }
                />
              </label>
            </div>
          </section>
        ))}
      </fieldset>
    </div>
  );
}
