import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Produccion from "./pages/Produccion";
import Remisiones from "./pages/Remisiones";
import Entregas from "./pages/Entregas";
import MisMotocarros from "./pages/MisMotocarros";
import Clientes from "./pages/Clientes";
import Importar from "./pages/Importar";
import Usuarios from "./pages/Usuarios";
import Bitacora from "./pages/Bitacora";
import Configuracion from "./pages/Configuracion";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" richColors />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/produccion" element={<ProtectedRoute roles={["admin","fabrica","logistica"]}><Produccion /></ProtectedRoute>} />
              <Route path="/remisiones" element={<Remisiones />} />
              <Route path="/entregas" element={<ProtectedRoute roles={["admin","logistica"]}><Entregas /></ProtectedRoute>} />
              <Route path="/mis-motocarros" element={<ProtectedRoute roles={["admin","ventas"]}><MisMotocarros /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute roles={["admin","fabrica"]}><Clientes /></ProtectedRoute>} />
              <Route path="/importar" element={<ProtectedRoute roles={["admin"]}><Importar /></ProtectedRoute>} />
              <Route path="/usuarios" element={<ProtectedRoute roles={["admin"]}><Usuarios /></ProtectedRoute>} />
              <Route path="/bitacora" element={<ProtectedRoute roles={["admin"]}><Bitacora /></ProtectedRoute>} />
              <Route path="/configuracion" element={<ProtectedRoute roles={["admin"]}><Configuracion /></ProtectedRoute>} />
              <Route path="/buscar" element={<Navigate to="/produccion" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
