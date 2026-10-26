import { AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

const ink = "#0c0b0b";
const text = "#f1efec";
const gold = "#c9a24a";
const growth = "#57c08a";

const LogoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const rule = interpolate(frame, [18, 48], [0, Math.min(600, width * 0.6)], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile("logo.png")} style={{ width: Math.min(720, width * 0.7), opacity: 0.4 + 0.6 * s, transform: `scale(${0.94 + 0.06 * s})` }} />
      <div style={{ width: rule, height: 4, background: gold, marginTop: 48 }} />
    </AbsoluteFill>
  );
};

const TitleScene: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ backgroundColor: ink, alignItems: "center", justifyContent: "center", textAlign: "center", padding: 80 }}>
      <h1 style={{ color: text, fontFamily: "Georgia, serif", fontSize: 96, margin: 0, opacity: s, transform: `translateY(${(1 - s) * 60}px)` }}>{title}</h1>
      <p style={{ color: growth, fontFamily: "sans-serif", fontSize: 44, marginTop: 24, opacity: interpolate(frame, [15, 33], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{subtitle}</p>
    </AbsoluteFill>
  );
};

export const BrandIntro: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <AbsoluteFill>
    <Audio src={staticFile("tone.mp3")} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={100}>
        <LogoScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={100}>
        <TitleScene title={title} subtitle={subtitle} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
