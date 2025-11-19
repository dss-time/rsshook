# Project Name

# 📦 rsshook

A lightweight and practical collection of React Hooks that provides commonly used utilities to help you build React applications more efficiently and elegantly.

---

## 🚀 Installation

Install using **yarn** or **npm**:

```bash
yarn add rsshook
# or
npm install rsshook
```

📘 Usage
🧩 useIsEmpty
Check whether a value is empty ("" | null | undefined | [] | {} and more).

```tsx
import { useIsEmpty } from 'rsshook';

const App = () => {
  const value = '';
  const isEmpty = useIsEmpty(value);

  console.log(isEmpty); // true

  return <div>{isEmpty ? 'Empty' : 'Not Empty'}</div>;
};
```

📚 Available Hooks (More coming soon)
Hook Name Description
useIsEmpty Determines whether a value is empty

More hooks are being continuously added. Contributions and ideas are welcome!

## 📄License

MIT License © 2025
Fully open source. Free to use, modify, and contribute.

## 💬 Support

If you need help, suggestions, or want to report issues:

📧 Email: d1667494390@gmail.com

## Keywords

react
react-hooks
javascript
typescript
rsshook
