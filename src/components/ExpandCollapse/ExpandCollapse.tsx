import React from "react";
import useExpandCollapse from "../../hooks/useExpandCollapse";
interface Option {
  text: string;
  maxLength: number;
}

const ExpandCollapse1: React.FC<Option> = ({ text, maxLength }) => {
  const { toggleText, toggleVisibility, shouldHideControl } = useExpandCollapse(
    text,
    maxLength
  );

  return (
    <div>
      <p>{toggleText}</p>
      {!shouldHideControl && (
        <div style={{ color: "#3f51b5" }} onClick={toggleVisibility}>
          {toggleText.includes("...") ? "展开" : "收起"}
        </div>
      )}
    </div>
  );
};

export default ExpandCollapse1;
