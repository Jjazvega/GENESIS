import React, { useState } from 'react';
import { firebase } from '@/api/firebaseClient';
import { useCompany } from '@/lib/companyContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Link as LinkIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const CONNECTOR_ID = '69fc08fbd8c13648e448f308';

export default function GoogleSheetsExporter() {
  const { activeCompany } = useCompany();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const handleConnect = async () => {
    try {
      setIsLoading(true);
      const url = await firebase.connectors.connectAppUser(CONNECTOR_ID);
      const popup = window.open(url, '_blank', 'width=500,height=600');
      
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          setIsLoading(false);
          setIsConnected(true);
          toast.success('Google Sheets conectado exitosamente');
        }
      }, 500);
    } catch (error) {
      setIsLoading(false);
      toast.error('Error conectando Google Sheets');
      console.error(error);
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      await firebase.connectors.disconnectAppUser(CONNECTOR_ID);
      setIsConnected(false);
      setSpreadsheetId('');
      toast.success('Google Sheets desconectado');
    } catch (error) {
      toast.error('Error desconectando Google Sheets');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    if (!spreadsheetId.trim()) {
      toast.error('Por favor ingresa el ID de la hoja de cálculo');
      return;
    }

    try {
      setIsExporting(true);
      const response = await firebase.functions.invoke('exportTransactionsToSheets', {
        companyId: activeCompany.id,
        spreadsheet_id: spreadsheetId.trim()
      });

      toast.success(response.data.message);
      setShowDialog(false);
      setSpreadsheetId('');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error exportando transacciones');
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4" style={{ borderColor: 'rgba(197,160,89,0.2)', background: 'rgba(197,160,89,0.02)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <h3 className="font-semibold text-sm">Google Sheets</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {isConnected ? 'Conectado' : 'Conecta tu cuenta para exportar transacciones'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {isConnected ? (
              <>
                <Button
                  size="sm"
                  onClick={() => setShowDialog(true)}
                  className="bg-primary hover:bg-primary/90"
                >
                  Exportar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Desconectar'
                  )}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={isLoading}
                className="gap-2"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LinkIcon className="w-4 h-4" />
                )}
                Conectar
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar transacciones a Google Sheets</DialogTitle>
            <DialogDescription>
              Ingresa el ID de tu hoja de cálculo de Google Sheets para exportar las transacciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">ID de la hoja de cálculo</label>
              <Input
                placeholder="Ej: 1BxiMVs0XRA5nFMKUVfIyWaIW"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Lo encuentras en la URL: sheets.google.com/spreadsheets/d/<strong>AQUI_VA_EL_ID</strong>
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                disabled={isExporting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleExport}
                disabled={isExporting || !spreadsheetId.trim()}
                className="gap-2"
              >
                {isExporting && <Loader2 className="w-4 h-4 animate-spin" />}
                Exportar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}