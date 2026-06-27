import React from "react";
import { PublicHeader } from "../../components/PublicHeader";
import { PublicFooter } from "../../components/PublicFooter";

interface LegalPageShellProps {
  title: string;
  children?: React.ReactNode;
}

export const LegalPageShell: React.FC<LegalPageShellProps> = ({ title, children }) => {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <PublicHeader />
      
      <main className="flex-grow pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-12 shadow-lg">
            <h1 className="text-3xl md:text-4xl font-bold mb-8 text-gray-900 text-center">
              {title}
            </h1>
            <div className="prose max-w-none prose-p:leading-relaxed prose-a:text-blue-600 hover:prose-a:text-blue-700 transition-colors text-gray-700">
              {children || (
                <div className="text-center text-gray-500 py-20 italic">
                  Content for {title} will be updated here soon.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
