import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import "../../componentStyling/UiPrimitives.css";

type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline";
};

export const UiButton = ({
  className,
  variant = "secondary",
  type = "button",
  ...props
}: UiButtonProps) => (
  <button
    type={type}
    className={["uiButton", className].filter(Boolean).join(" ")}
    data-variant={variant}
    {...props}
  />
);

export const UiInput = ({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={["uiInput", className].filter(Boolean).join(" ")}
    {...props}
  />
);

export const UiSelect = ({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={["uiSelect", className].filter(Boolean).join(" ")}
    {...props}
  >
    {children}
  </select>
);
