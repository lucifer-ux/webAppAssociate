import type { ButtonHTMLAttributes, ReactNode } from "react";
import "../componentStyling/Button.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  text?: string;
  backgroundColor?: string;
  color?: string;
  width?: number | string;
  isBorder?: boolean;
  showImage?: boolean;
  image?: ReactNode;
  imagePosition?: "left" | "right";
};

const Button = ({
  children,
  text,
  backgroundColor,
  color,
  width,
  isBorder,
  showImage = false,
  image,
  imagePosition = "left",
  className,
  style,
  type = "button",
  ...rest
}: ButtonProps) => {
  const resolvedClassName = ["buttonStyle", className].filter(Boolean).join(" ");
  const resolvedWidth =
    typeof width === "number" ? `${width}rem` : width;

  const content = children ?? text;
  const shouldRenderImage = showImage && Boolean(image);
  const isIconOnly = shouldRenderImage && !content;
  const finalClassName = [resolvedClassName, isIconOnly ? "buttonStyleIconOnly" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={finalClassName}
      style={{
        ...(backgroundColor ? { backgroundColor } : {}),
        ...(color ? { color } : {}),
        ...(resolvedWidth ? { width: resolvedWidth } : {}),
        ...(typeof isBorder === "boolean"
          ? { border: isBorder ? "1px solid #1B1C19" : "none" }
          : {}),
        ...style,
      }}
      {...rest}
    >
      {shouldRenderImage && imagePosition === "left" ? (
        <span className="buttonImage" aria-hidden="true">
          {image}
        </span>
      ) : null}
      {content}
      {shouldRenderImage && imagePosition === "right" ? (
        <span className="buttonImage" aria-hidden="true">
          {image}
        </span>
      ) : null}
    </button>
  );
};

export default Button;
