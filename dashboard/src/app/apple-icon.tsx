import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#f5f1eb",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 112,
            fontWeight: 800,
            color: "#1a1a1a",
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          P
        </div>
        <div
          style={{
            width: 80,
            height: 8,
            background: "#16a34a",
            borderRadius: 4,
            marginTop: 6,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
