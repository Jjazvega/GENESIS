import { useState } from 'react';
import { DOCUMENT_STATUSES, firebase } from '@/api/firebaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { companyEntityQueryKey, useCompanyDocuments } from '@/lib/companyEntityQueries';
import { useCompany } from '@/lib/companyContext';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { FileText, Upload, Search, Eye, Brain, Loader2, Trash2, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadDocumentFlow } from '@/features/documents/services/uploadDocumentFlow';
import { analyzeDocumentFlow } from '@/features/documents/services/analyzeDocumentFlow';
import { useDebouncedValue, useFilteredDocuments } from '@/features/documents/hooks/useFilteredDocuments';

const statusColors = {
  [DOCUMENT_STATUSES.UPLOADED]: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  [DOCUMENT_STATUSES.UPLOADING]: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  [DOCUMENT_STATUSES.PENDING]: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  [DOCUMENT_STATUSES.PROCESSING]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  [DOCUMENT_STATUSES.ANALYZED]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  [DOCUMENT_STATUSES.ERROR]: 'bg-red-500/10 text-red-400 border-red-500/20',
  [DOCUMENT_STATUSES.ARCHIVED]: 'bg-muted text-muted-foreground border-border',
  [DOCUMENT_STATUSES.AI_DISABLED]: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
};

const statusLabels = {
  [DOCUMENT_STATUSES.UPLOADED]: 'Subido',
  [DOCUMENT_STATUSES.UPLOADING]: 'Subiendo',
  [DOCUMENT_STATUSES.PENDING]: 'Pendiente',
  [DOCUMENT_STATUSES.PROCESSING]: 'Procesando',
  [DOCUMENT_STATUSES.ANALYZED]: 'Analizado',
  [DOCUMENT_STATUSES.ERROR]: 'Error',
  [DOCUMENT_STATUSES.ARCHIVED]: 'Archivado',
  [DOCUMENT_STATUSES.AI_DISABLED]: 'IA no configurada',
};

const analyzableStatuses = new Set([
  DOCUMENT_STATUSES.UPLOADED,
  DOCUMENT_STATUSES.PENDING,
  DOCUMENT_STATUSES.AI_DISABLED,
]);

const docTypeLabels = {
  factura: 'Factura', nota_credito: 'Nota de Crédito', recibo: 'Recibo', contrato: 'Contrato',
  estado_cuenta: 'Estado de Cuenta', declaración: 'Declaración', nómina: 'Nómina', otro: 'Otro'
};

const getErrorMessage = (error, fallback) => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export default function Documents() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const { data: documents = [], isLoading } = useCompanyDocuments(activeCompany);

  const documentsQueryKey = companyEntityQueryKey('documents', activeCompany);

  const invalidateDocuments = () => queryClient.invalidateQueries({ queryKey: documentsQueryKey });

  const deleteMutation = useMutation({
    mutationFn: (id) => firebase.entities.Document.archive(id),
    onSuccess: invalidateDocuments,
    onError: (error) => {
      toast({
        title: 'No se pudo eliminar',
        description: getErrorMessage(error, 'Intenta nuevamente.'),
        variant: 'destructive',
      });
    },
  });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      await uploadDocumentFlow({
        file,
        company: activeCompany,
        user,
      });

      invalidateDocuments();
      toast({ title: 'Documento subido', description: 'Ahora puedes analizarlo con IA.' });
    } catch (error) {
      toast({
        title: 'No se pudo subir el documento',
        description: getErrorMessage(error, 'Verifica Firebase Storage y vuelve a intentar.'),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleOpenDocument = async (doc) => {
    if (!doc?.storagePath) {
      toast({
        title: 'Documento sin archivo',
        description: 'No se encontró la ruta segura del archivo en Storage.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const accessUrl = await firebase.integrations.Core.GetDocumentAccessUrl(doc.storagePath);
      window.open(accessUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({
        title: 'No se pudo abrir el documento',
        description: getErrorMessage(error, 'Verifica tus permisos de Firebase Storage y vuelve a intentar.'),
        variant: 'destructive',
      });
    }
  };

  const handleAnalyze = async (doc) => {
    setAnalyzing(doc.id);

    try {
      const analysis = await analyzeDocumentFlow({
        doc,
        company: activeCompany,
        user,
      });

      invalidateDocuments();
      if (analysis.status === 'ai_disabled') {
        toast({ title: 'IA no configurada', description: analysis.message });
      } else {
        toast({ title: 'Análisis completado', description: 'El documento ha sido procesado con IA.' });
      }
    } catch (error) {
      invalidateDocuments();
      toast({
        title: 'No se pudo analizar',
        description: getErrorMessage(error, 'Verifica el backend seguro de IA y vuelve a intentar.'),
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(null);
    }
  };

  const debouncedSearch = useDebouncedValue(search);
  const filtered = useFilteredDocuments(documents, debouncedSearch, filterType);

  if (!activeCompany) return <EmptyState icon={FileText} title="Selecciona una empresa" description="Necesitas una empresa activa para ver documentos." />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Documentos"
        description="Sube, analiza y gestiona tus documentos fiscales."
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="file" id="file-upload" className="hidden" accept=".pdf,.xml" onChange={handleUpload} />
              <Button
                onClick={() => document.getElementById('file-upload').click()}
                aria-label="Subir documento"
                disabled={uploading}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Subir Documento
              </Button>
            </div>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar documentos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-card border-border" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 bg-card border-border">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(docTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Documents List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="Sin documentos" description="Sube tu primer documento para comenzar el análisis." />
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map(doc => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className={`text-xs border ${statusColors[doc.status] || ''}`}>
                      {statusLabels[doc.status] || doc.status}
                    </Badge>
                    {doc.docType && (
                      <Badge variant="outline" className="text-xs border-border">
                        {docTypeLabels[doc.docType] || doc.docType}
                      </Badge>
                    )}
                    {doc.total && <span className="text-xs text-muted-foreground">${doc.total.toLocaleString()}</span>}
                    {doc.docDate && <span className="text-xs text-muted-foreground">{doc.docDate}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {analyzableStatuses.has(doc.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAnalyze(doc)}
                      aria-label={`Analizar documento ${doc.title}`}
                      disabled={analyzing === doc.id}
                      className="border-primary/30 text-primary hover:bg-primary/10"
                    >
                      {analyzing === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setSelectedDoc(doc)} aria-label={`Ver documento ${doc.title}`} className="border-border">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate(doc.id)} aria-label={`Archivar documento ${doc.title}`} className="border-border text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Document Detail Dialog */}
      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display">{selectedDoc?.title}</DialogTitle>
          </DialogHeader>
          {selectedDoc && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              {selectedDoc.ai_summary && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-semibold text-primary mb-1">Resumen IA</p>
                  <p className="text-sm text-foreground">{selectedDoc.ai_summary}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {selectedDoc.rfc_emisor && <div><p className="text-xs text-muted-foreground">RFC Emisor</p><p className="text-sm font-medium">{selectedDoc.rfc_emisor}</p></div>}
                {selectedDoc.rfc_receptor && <div><p className="text-xs text-muted-foreground">RFC Receptor</p><p className="text-sm font-medium">{selectedDoc.rfc_receptor}</p></div>}
                {selectedDoc.subtotal != null && <div><p className="text-xs text-muted-foreground">Subtotal</p><p className="text-sm font-medium">${selectedDoc.subtotal?.toLocaleString()}</p></div>}
                {selectedDoc.iva != null && <div><p className="text-xs text-muted-foreground">IVA</p><p className="text-sm font-medium">${selectedDoc.iva?.toLocaleString()}</p></div>}
                {selectedDoc.total != null && <div><p className="text-xs text-muted-foreground">Total</p><p className="text-sm font-bold text-primary">${selectedDoc.total?.toLocaleString()}</p></div>}
                {selectedDoc.docDate && <div><p className="text-xs text-muted-foreground">Fecha</p><p className="text-sm font-medium">{selectedDoc.docDate}</p></div>}
              </div>
              {selectedDoc.errorMessage && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs font-semibold text-destructive mb-1">Error</p>
                  <p className="text-sm text-foreground">{selectedDoc.errorMessage}</p>
                </div>
              )}
              {selectedDoc.concepts?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Conceptos</p>
                  <div className="space-y-2">
                    {selectedDoc.concepts.map((c, i) => (
                      <div key={i} className="flex justify-between items-center p-2 rounded-md bg-secondary text-sm">
                        <span className="flex-1">{c.description}</span>
                        <span className="text-muted-foreground">{c.quantity} x ${c.unit_price?.toLocaleString()}</span>
                        <span className="font-medium ml-4">${c.amount?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedDoc.tags?.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {selectedDoc.tags.map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs border-primary/30 text-primary">{tag}</Badge>
                  ))}
                </div>
              )}
              {selectedDoc.storagePath && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenDocument(selectedDoc)}
                  className="border-primary/30 text-primary hover:bg-primary/10"
                >
                  Ver archivo original →
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
