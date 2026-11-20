import * as xb from 'xrblocks';
import { StudioApp } from './StudioApp.ts';
import { LibraryGallery } from './web/LibraryGallery.ts';
import { Onboarding, markOnboarded, continueToDestination } from './web/Onboarding.ts';

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.setAppTitle('PrimeTech — SamScene 3D Studio');
  options.setAppDescription(
    'PrimeTech CAD software builds, SamScene 3D environment studio, dynamic lighting, GLB/BIM/media ingestion & SamSpeak voice studio.'
  );
  options.enableReticles();
  options.enableControllers();
  options.xrButton.enabled = false;
  options.enableSimulator = false;

  xb.add(new StudioApp());
  void xb.init(options);

  new LibraryGallery().mount(document.body);
  const onboarding = new Onboarding();
  if (onboarding.shouldShow()) void onboarding.mount(document.body);
  else {
    markOnboarded(); // finished earlier on this browser: let the host site know too
    continueToDestination();
  }
});
