import { useExpandCollapse } from "@/hooks/useExpandCollapse";
import React, { ReactNode } from "react";

interface Option {
  content: ReactNode | string;
  maxLength: number;
}

const ExpandCollapse: React.FC<Option> = ({ content, maxLength }) => {
  const { toggleContent, toggleVisibility, shouldHideControl, isCollapsed } =
    useExpandCollapse(content, maxLength);

  return (
    <div>
      <div>
        {toggleContent}
        {!shouldHideControl && isCollapsed && (
          <span
            style={{ color: "#3f51b5", cursor: "pointer", marginLeft: "4px" }}
            onClick={toggleVisibility}
          >
            {"展开"}
          </span>
        )}
      </div>
      {!shouldHideControl && !isCollapsed && (
        <div
          style={{ color: "#3f51b5", cursor: "pointer" }}
          onClick={toggleVisibility}
        >
          {"收起"}
        </div>
      )}
    </div>
  );
};

export default ExpandCollapse;
