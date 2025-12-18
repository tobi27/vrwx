import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowRight, Loader2, XCircle } from 'lucide-react';
import { api } from '../lib/api';

export const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [paymentInfo, setPaymentInfo] = useState<any>(null);

  useEffect(() => {
    if (sessionId) {
      api.getPaymentStatus(sessionId)
        .then(data => {
          setPaymentInfo(data);
          setStatus(data.status === 'paid' ? 'success' : 'error');
        })
        .catch(() => {
          setStatus('error');
        });
    } else {
      setStatus('error');
    }
  }, [sessionId]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === 'loading' && (
          <div className="animate-in fade-in">
            <Loader2 className="w-16 h-16 text-primary mx-auto animate-spin mb-6" />
            <h1 className="text-2xl font-bold text-white mb-2">Processing Payment...</h1>
            <p className="text-slate-400">Please wait while we confirm your payment.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="animate-in fade-in zoom-in">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
            <p className="text-slate-400 mb-8">
              Your service order has been confirmed. You'll receive a confirmation email shortly.
            </p>

            {paymentInfo?.amountTotal && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
                <div className="text-sm text-slate-400 mb-1">Amount Paid</div>
                <div className="text-2xl font-mono font-bold text-emerald-400">
                  ${paymentInfo.amountTotal.toFixed(2)}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Link
                to="/marketplace"
                className="w-full py-3 bg-primary hover:bg-blue-600 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
              >
                Browse Marketplace <ArrowRight size={18} />
              </Link>
              <Link
                to="/receipts"
                className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
              >
                View Receipts
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="animate-in fade-in">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Payment Issue</h1>
            <p className="text-slate-400 mb-8">
              We couldn't verify your payment. If you were charged, please contact support.
            </p>
            <Link
              to="/quote"
              className="w-full py-3 bg-primary hover:bg-blue-600 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
            >
              Try Again <ArrowRight size={18} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
