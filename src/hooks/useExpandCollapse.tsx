import { useState } from "react";
/**
@example text 是传入的文本(text is the text passed in)

@param maxLength 最大显示数字数量(Maximum number of displayed digits)
*/
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
