import { Route, Routes } from 'react-router-dom'
import { Header } from './components/Header'
import { HomePage } from './pages/HomePage'
import { EditorPage } from './pages/EditorPage'
import { ProofPage } from './pages/ProofPage'
import { CategoryPage } from './pages/CategoryPage'

export default function App() {
  return (
    <div className="min-h-svh">
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/category/:categoryId" element={<CategoryPage />} />
        <Route path="/editor/:templateId" element={<EditorPage />} />
        <Route path="/proof/:templateId" element={<ProofPage />} />
        <Route path="*" element={<p className="p-6">Coming in the next step.</p>} />
      </Routes>
    </div>
  )
}
