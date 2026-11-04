import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { Header } from './components/Header'
import { DemoGuide } from './components/DemoGuide'
import { ToastProvider } from './components/Toast'
import { HomePage } from './pages/HomePage'
import { CategoryPage } from './pages/CategoryPage'
import { EditorPage } from './pages/EditorPage'
import { ProofPage } from './pages/ProofPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { ConfirmationPage } from './pages/ConfirmationPage'
import { OrderEmailPage } from './pages/OrderEmailPage'
import { AdminPage } from './pages/AdminPage'
import { PartnersPage } from './pages/PartnersPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-semibold">Page not found</h1>
      <Link to="/" className="btn-primary mt-6">Back to the shop</Link>
    </div>
  )
}

function Footer() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/editor')) return null
  return (
    <footer className="mt-10 border-t border-line bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 pb-24 text-sm text-muted sm:flex-row sm:justify-between lg:px-6 lg:pb-6">
        <p><span className="font-display text-lg font-bold text-ink">Kemp &amp; Sons</span>  Printing for life's important moments.</p>
        <p>Sales demo. No real orders, payments or emails.</p>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ScrollToTop />
      <div className="flex min-h-svh flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/category/:categoryId" element={<CategoryPage />} />
            <Route path="/editor/:templateId" element={<EditorPage />} />
            <Route path="/proof/:templateId" element={<ProofPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/order/:orderId" element={<ConfirmationPage />} />
            <Route path="/shop/email/:orderId" element={<OrderEmailPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/partners" element={<PartnersPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
      </div>
      <DemoGuide />
    </ToastProvider>
  )
}
