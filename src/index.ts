import * as xb from 'xrblocks';
import { StudioApp } from './StudioApp.ts';

document.addEventListener('DOMContentLoaded', () => {
  const options = new xb.Options();
  options.setAppTitle('SamScene — Creative Studio & SamSpeak');
  options.setAppDescription(
    'SamScene 3D environment studio, dynamic lighting, GLB/BIM/media ingestion & SamSpeak voice studio.'
  );
  options.enableReticles();
  options.enableControllers();
  options.xrButton.enabled = false;
  options.enableSimulator = false;

  xb.add(new StudioApp());
  void xb.init(options);
});
