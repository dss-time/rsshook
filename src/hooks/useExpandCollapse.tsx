import { useState } from "react";

const useExpandCollapse = (text: string, maxLength: number) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleText =
    text.length > maxLength && !isExpanded
      ? `${text.substring(0, maxLength)}...`
      : text;

  const toggleVisibility = () => {
    setIsExpanded(!isExpanded);
  };

  const shouldHideControl = text.length <= maxLength;

  return { toggleText, toggleVisibility, shouldHideControl };
};

export default useExpandCollapse;
