import { Button, Switch } from "@mantine/core";
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
  return (
    <div className="settings-models">
      <fieldset disabled={disabled}>
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
      </fieldset>
    </div>
  );
}
