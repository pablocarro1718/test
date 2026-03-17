import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#f5f1eb",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontSize: 22,
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
            width: 16,
            height: 2,
            background: "#16a34a",
            borderRadius: 1,
            marginTop: 2,
          }}
        />
      </div>
    ),
    { ...size }
  );
}
