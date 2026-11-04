import { Route, Routes } from 'react-router-dom'
import { Header } from './components/Header'
import { HomePage } from './pages/HomePage'
import { EditorPage } from './pages/EditorPage'

export default function App() {
  return (
    <div className="min-h-svh">
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor/:templateId" element={<EditorPage />} />
        <Route path="*" element={<p className="p-6">Coming in the next step.</p>} />
      </Routes>
    </div>
  )
}
