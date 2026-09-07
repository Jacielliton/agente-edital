import React from "react";
import { Link } from "react-router-dom";
import "./ui.css";

const cx = (...parts) => parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Button
   Renderiza <button>, <a> ou <Link> conforme as props recebidas.        */
export function Button({
  variant = "default",   // default | primary | ghost | danger
  size = "md",           // sm | md | lg
  block = false,
  to,
  href,
  icon = null,
  children,
  className,
  ...rest
}) {
  const cls = cx(
    "ui-btn",
    variant !== "default" && `ui-btn--${variant}`,
    size !== "md" && `ui-btn--${size}`,
    block && "ui-btn--block",
    className
  );

  const content = (
    <>
      {icon}
      {children}
    </>
  );

  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return <button className={cls} {...rest}>{content}</button>;
}

/* -------------------------------------------------------------------- Card */
export function Card({ raised = false, pad = false, className, children, ...rest }) {
  return (
    <div
      className={cx("ui-card", raised && "ui-card--raised", pad && "ui-card--pad", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, action = null, children }) {
  return (
    <div className="ui-card__head">
      {children || <h3>{title}</h3>}
      {action}
    </div>
  );
}

export function CardBody({ className, children, ...rest }) {
  return <div className={cx("ui-card__body", className)} {...rest}>{children}</div>;
}

/* ------------------------------------------------------------------- Badge */
export function Badge({ tone = "default", outline = false, icon = null, children, className }) {
  return (
    <span className={cx("ui-badge", tone !== "default" && `ui-badge--${tone}`, outline && "ui-badge--outline", className)}>
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- Input */
export function Input({ label, icon = null, className, ...rest }) {
  const field = icon ? (
    <span className="ui-input-wrap">
      {icon}
      <input className={cx("ui-input", "ui-input--icon", className)} {...rest} />
    </span>
  ) : (
    <input className={cx("ui-input", className)} {...rest} />
  );

  if (!label) return field;
  return (
    <label className="ui-field">
      <span className="ui-field__label">{label}</span>
      {field}
    </label>
  );
}

/* -------------------------------------------------------------- ProgressBar */
export function ProgressBar({ value = 0, color, "aria-label": ariaLabel }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className="ui-progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <i style={{ width: `${pct}%`, ...(color ? { background: color } : null) }} />
    </div>
  );
}

/* ---------------------------------------------------------------- StatCard */
export function StatCard({ label, value, textValue = false, delta, deltaTone = "flat", icon = null, spark = null }) {
  return (
    <div className="ui-stat">
      <span className="ui-stat__label">{label}</span>
      <span className={cx("ui-stat__value", textValue && "ui-stat__value--text")}>{value}</span>
      {spark && spark.length > 0 && (
        <span className="ui-spark" aria-hidden="true">
          {spark.map((h, i) => (
            <i
              key={i}
              className={i === spark.length - 1 ? "is-last" : undefined}
              style={{ height: `${Math.max(6, Math.min(100, h))}%` }}
            />
          ))}
        </span>
      )}
      {delta && (
        <span className={cx("ui-stat__delta", deltaTone !== "flat" && `ui-stat__delta--${deltaTone}`)}>
          {icon}
          {delta}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- EmptyState */
export function EmptyState({ icon = null, title, description, action = null }) {
  return (
    <div className="ui-empty">
      {icon && <span className="ui-empty__icon">{icon}</span>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Skeleton */
export function Skeleton({ width = "100%", height = 16, radius, style }) {
  return (
    <span
      className="ui-skel"
      style={{
        display: "block",
        width,
        height: typeof height === "number" ? `${height}px` : height,
        ...(radius ? { borderRadius: radius } : null),
        ...style,
      }}
    />
  );
}

/* -------------------------------------------------------------- PageHeader */
export function PageHeader({ eyebrow, title, description, actions = null }) {
  return (
    <div className="ui-pagehead">
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div className="ui-pagehead__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ui-pagehead__actions">{actions}</div>}
    </div>
  );
}
