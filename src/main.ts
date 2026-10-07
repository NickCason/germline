import '@fontsource-variable/fredoka';
import './styles.css';
import { App } from './ui/app';

const root = document.getElementById('app')!;
// Canvas text needs the web font loaded before the first frame, or it falls back.
void document.fonts.load('600 17px "Fredoka Variable"').finally(() => new App(root).start());
