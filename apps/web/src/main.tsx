import { createRoot } from 'react-dom/client';
import { PhoneApp } from './phone/PhoneApp';
import { usePath } from './router';
import { TvApp } from './tv/TvApp';
import { TvStart } from './tv/TvStart';
import './styles.css';

function App() {
  const path = usePath();
  const tv = path.match(/^\/tv\/([\w-]+)/);
  if (tv) return <TvApp key={tv[1]} sessionId={tv[1]!} />;
  const join = path.match(/^\/j(?:\/([A-Za-z]{4}))?\/?$/);
  if (join) return <PhoneApp code={join[1]} />;
  return <TvStart />;
}

createRoot(document.getElementById('root')!).render(<App />);
