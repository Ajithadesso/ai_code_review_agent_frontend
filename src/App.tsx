import React from "react";
import { CodeAnalyzer } from "./components/CodeAnalyzer";

const App: React.FC = () => {
  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "1.5rem",
        maxWidth: "960px",
        margin: "0 auto"
      }}
    >
      <CodeAnalyzer />
    </div>
  );
};

export default App;
