import Game from './components/Game.tsx';
import { ToastContainer } from 'react-toastify';

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden font-body bg-brown-900">
      <Game />
      <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
    </main>
  );
}
