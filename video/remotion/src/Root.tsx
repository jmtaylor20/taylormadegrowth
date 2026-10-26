import { Composition } from "remotion";
import { BrandIntro } from "./BrandIntro";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="BrandIntro"
      component={BrandIntro}
      durationInFrames={180}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ title: "Video pipeline online", subtitle: "Remotion · React · FFmpeg" }}
    />
    <Composition
      id="BrandIntroVertical"
      component={BrandIntro}
      durationInFrames={180}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ title: "Video pipeline online", subtitle: "Remotion · React · FFmpeg" }}
    />
  </>
);
