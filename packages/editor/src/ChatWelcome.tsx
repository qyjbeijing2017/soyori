import { useId } from "react";
import { tr } from "./i18n";
import { Icon, type IconName } from "./ui";

export function ChatWelcome({ mobile }: { mobile: boolean | undefined }) {
  const titleId = useId();
  const guides: { chapter: string; icon: IconName; title: string; description: string }[] = [
    {
      chapter: mobile ? "quick-start-mobile" : "quick-start",
      icon: "play",
      title: "我想快速开始",
      description: "跟着图文，做出第一个 AI 流程",
    },
    {
      chapter: "quick-start-memory",
      icon: "chat",
      title: "让助手记住对话",
      description: "为助手添加记忆，让对话接得上",
    },
    {
      chapter: "quick-start-tools",
      icon: "call",
      title: "让助手使用工具",
      description: "从查询时间开始，让助手动手做事",
    },
  ];
  return (
    <section className="chat-empty chat-welcome" aria-labelledby={titleId}>
      <div className="welcome-brand" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}brand/soyori-logo.png?v=breeze-1`}
          width="64"
          height="64"
          alt=""
        />
        <span>Soyori</span>
      </div>
      <h1 id={titleId}>{tr("让想法，一步步变成 AI 助手。")}</h1>
      <p className="welcome-intro">{tr("从一次对话开始，或跟着教程搭建自己的流程。")}</p>
      <nav className="welcome-guides" aria-label={tr("入门指引")}>
        {guides.map((guide, index) => (
          <a
            className="welcome-guide"
            href={`#document/${guide.chapter}`}
            key={guide.chapter}
            style={{ animationDelay: `${180 + index * 90}ms` }}
          >
            <span className="welcome-guide-icon">
              <Icon name={guide.icon} />
            </span>
            <span className="welcome-guide-copy">
              <strong>{tr(guide.title)}</strong>
              <span>{tr(guide.description)}</span>
            </span>
            <span className="welcome-guide-arrow">
              <Icon name="chevronRight" />
            </span>
          </a>
        ))}
      </nav>
      <p className="welcome-hint">{tr("也可以直接在下方输入，和当前 Agent 对话。")}</p>
    </section>
  );
}
