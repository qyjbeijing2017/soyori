import type { AiSettings as Settings } from "./ai-host";

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
    <details className="advanced">
      <summary>AI 设置</summary>
      <fieldset disabled={disabled} className="form-fields">
        <p className="muted">
          配置仅保留在当前页面，刷新后清除；密钥不写入流程。API
          请求由浏览器直接发送到所填服务地址，服务需支持跨域。
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={value.allowLocalDownload}
            onChange={(e) => onChange({ ...value, allowLocalDownload: e.target.checked })}
          />
          允许首次运行时下载免费本地模型（约 255 MB 权重，另需运行库）
        </label>
        <p className="muted">
          本地模型使用设备 WebGPU，不需要 API
          Key。后续复用缓存；并非所有手机都支持。取消本地调用会释放模型。
        </p>
        <button type="button" onClick={onRelease}>
          释放本地模型内存
        </button>
        {(["openai", "anthropic"] as const).map((provider) => (
          <details key={provider}>
            <summary>{provider === "openai" ? "OpenAI / 兼容服务" : "Anthropic"}</summary>
            <div className="form-fields">
              <label>
                API Key
                <input
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
              <label>
                默认模型
                <input
                  value={value[provider].model ?? ""}
                  placeholder="填写该服务提供的模型 ID"
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [provider]: { ...value[provider], model: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                服务地址（留空使用官方地址）
                <input
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
          </details>
        ))}
      </fieldset>
    </details>
  );
}
