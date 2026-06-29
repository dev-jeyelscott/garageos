import { LandingPage } from '../src/features/marketing/landing-page';
import { MotionProvider } from '../src/shared/motion';

export default function HomePage() {
  return (
    <MotionProvider>
      <LandingPage />
    </MotionProvider>
  );
}
