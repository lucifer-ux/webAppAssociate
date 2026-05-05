import "../componentStyling/Button.css";

interface ButtonProps {
  backgroundColor: string;
  text: string;
  color: string;
  width: number;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}

const Button = (buttonProps: ButtonProps) => {
  return (
    <>
      <button
        className="buttonStyle"
        style={{
          backgroundColor: buttonProps.backgroundColor,
          color: buttonProps.color,
          width: `${buttonProps.width}rem`,
        }}
      >
        {buttonProps.text}
      </button>
    </>
  );
};

export default Button;
