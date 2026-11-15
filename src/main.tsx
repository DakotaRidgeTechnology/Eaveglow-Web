import { render } from 'preact';
import { App } from './app';
import './styles.css';
import { applyTheme } from './theme';

applyTheme();

render(<App />, document.getElementById('app')!);
