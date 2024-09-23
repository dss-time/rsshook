import { ReactNode, useState } from "react";
/**
@example content 是传入的文本或元素(content is the passed text or HTMLElement )

@param maxLength 最大显示数字数量(Maximum number of displayed digits)
*/
export const useExpandCollapse = (content: ReactNode, maxLength: number) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getTextContent = (node: ReactNode): string => {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(getTextContent).join("");
    if (typeof node === "object" && node !== null && "props" in node) {
      return getTextContent(node.props.children);
    }
    return "";
  };

  const text = getTextContent(content);

  const toggleContent =
    text.length > maxLength && !isExpanded ? (
      <>{text.substring(0, maxLength)}...</>
    ) : (
      <>{content}</>
    );

  const toggleVisibility = () => {
    setIsExpanded(!isExpanded);
  };

  const shouldHideControl = text.length <= maxLength;
  const isCollapsed = text.length > maxLength && !isExpanded;

  return {
    toggleContent,
    toggleVisibility,
    shouldHideControl,
    isCollapsed,
    text,
  };
};
