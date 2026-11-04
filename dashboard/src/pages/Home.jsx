import React, { useState } from "react";
import { Navbar } from './Navbar';
import Footer from './Footer';
import { ChevronDown } from 'lucide-react'; 

const Home = () => {
  const [openIndex, setOpenIndex] = useState(null);

  
  const specs = [
    { label: "Data retention", value: "Forever" },
    { label: "Repositories", value: "Unlimited" },
    { label: "Features", value: "Everything" },
  ];

  const faqs = [
    {
      q: "What is this platform?",
      a: "It is a self-hosted deployment platform where you can deploy any GitHub repository with one click and get a live URL instantly.",
    },
    {
      q: "What kind of projects can I deploy?",
      a: "You can deploy any project with a build script — Vite, React, Next.js, plain HTML, or any Node.js project. We auto-detect your package manager and framework.",
    },
    {
      q: "Do I need to configure anything?",
      a: "No. Just paste your GitHub repo URL, select a branch, and click Deploy. We handle cloning, installing dependencies, building, and serving your project.",
    },
    {
      q: "How long does a deployment take?",
      a: "Most projects deploy in under 2 minutes. The time depends on the size of your project and how many dependencies it has.",
    },
    {
      q: "What happens if my build fails?",
      a: "The deployment status will show as failed. You can see the build logs to understand what went wrong, fix your code, and redeploy.",
    },
    {
      q: "Can I deploy a plain HTML project?",
      a: "Yes. If your repo has no package.json we detect it as a static site and serve it directly without any build step.",
    },
    {
      q: "How do I see my past deployments?",
      a: "Every project on your dashboard shows all past deployments with their status, date, and URL.",
    },
    {
      q: "Is my data safe?",
      a: "Yes. Your code is cloned temporarily for building and deleted immediately after. Only the final build output is stored.",
    },
    {
      q: "Can I redeploy the same project?",
      a: "Yes. Just go to your project and click Deploy again. Each deployment gets its own unique ID and URL.",
    },
    {
      q: "What package managers are supported?",
      a: "We support npm, yarn, and pnpm. We auto-detect which one your project uses based on the lock file.",
    },
  ];

  return (
    <>
      <div className="min-h-screen bg-white cool w-full flex flex-col justify-start items-center mx-auto px-6 py-20 gap-8">
        <Navbar />
        
        <div className="max-w-5xl w-fullmin-h-screen">
           <section className="flex flex-col items-center text-center py-20 px-6 bg-white">
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 mb-8 hover:cursor-pointer">
          <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase italic">New</span>
          <span className="text-indigo-600 text-sm font-medium">v1.0.0 is out! 🎈</span>
          <span className="text-indigo-300 text-sm">›</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 tracking-tight max-w-2xl mb-4">
          Ship faster than <br /> ever before
        </h1>
        <p className="text-gray-500 text-lg max-w-lg mb-7 leading-relaxed">
          Deploy lightning fast web apps to a global network with zero configuration.
        </p>
        <div className="flex items-center gap-4">
          <a
            href="/dashboard"
            className="bg-black hover:bg-gray-900 text-white font-medium px-8 py-3 rounded-full transition-colors">
            Get started
          </a>
          <a className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-8 py-3 rounded-full transition-colors">
            See demo
          </a>
        </div>
      </section>

        </div>

{/* Pricing */}
         <section id="Pricing" className="flex flex-col items-center text-center py-12 px-6 bg-white mt-2 mb-8 max-w-sm mx-auto">
        <span className="inline-block px-3 py-1 mb-6 text-xs font-medium text-gray-500 bg-gray-100 rounded-md">
          Pricing
        </span>
        <h2 className="text-4xl font-bold text-gray-900 mb-2 tracking-tight">Free forever</h2>
        <p className="text-gray-400 text-sm mb-8 leading-snug">
          Simple and transparent pricing. No hidden fees.
        </p>
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xl text-gray-300 line-through">$10</span>
            <span className="text-4xl font-bold text-gray-900">$0</span>
          </div>
          <p className="text-gray-400 text-[10px] uppercase tracking-wider mt-1">Per month</p>
        </div>
        <div className="w-full bg-gray-50 rounded-xl overflow-hidden mb-6 border border-gray-100">
          {specs.map((item, i) => (
            <div
              key={i}
              className="flex justify-between items-center px-4 py-3 border-b last:border-b-0 border-gray-200/50"
            >
              <span className="text-gray-900 font-medium text-xs">{item.label}</span>
              <span className="text-gray-500 text-xs">{item.value}</span>
            </div>
          ))}
        </div>
        <button className="w-full bg-black hover:bg-gray-900 text-white cursor-alias text-sm font-bold py-3 rounded-full transition-all shadow-md shadow-indigo-100">
          Start now for free
        </button>
        <p className="text-gray-400 text-[10px] mt-3 ">No credit card required</p>
      </section>




        {/* FAQ Section */}
        <section className="w-full max-w-xl mx-auto px-6 py-26 flex flex-col items-center">
          <span className="inline-block px-3 py-1 mb-6 text-xs font-medium text-gray-500 bg-gray-100 rounded-md">
            FAQ
          </span>
          <h2 className="text-[40px] font-bold text-[#121212] leading-tight mb-4 text-center">
            Frequently <br /> asked questions
          </h2>
          <p className="text-slate-500 text-sm text-center max-w-sm mb-10">
            Quick answers to common questions about pricing, privacy, setup, and more.
          </p>
          <div className="w-full space-y-1">
            {faqs.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <div
                  key={index}
                  className={`rounded-2xl transition-all duration-200 hover:bg-gray-200 ${isOpen ? "bg-gray-100" : "bg-gray-100"}`}
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : index)} 
                    className="w-full flex items-center justify-between py-4 px-5 text-left"
                  >
                    <span
                      className={`text-[14.5px] font-bold transition-colors ${isOpen ? "text-[#121212]" : "text-[#444]"}`}
                    >
                      {faq.q}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-indigo-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} 
                    />
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"}`}
                  >
                    <p className="px-5 pb-5 text-[13.5px] leading-relaxed text-slate-500 font-medium max-w-[90%]">
                      {faq.a}
                    </p>
                  </div>
                  {!isOpen && index !== faqs.length - 1 && (
                    <div className="mx-5 h-[1px] bg-slate-100" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA Section */}
        <div className="bg-[#f9f9fb] rounded-[32px] py-12 px-6 flex flex-col w-full max-w-5xl items-center text-center border border-slate-100">
          <h2 className="text-[38px] font-bold text-[#121212] leading-tight mb-4 tracking-tight">
            Ship your code to <br /> the edge
          </h2>
          <p className="text-[#666666] text-[16px] max-w-sm leading-relaxed mb-10">
            Deploy lightning-fast web apps to a global network with zero configuration.
          </p>

          <div className="flex items-center gap-3">
            <a
              href="/dashboard"
              className="bg-black hover:bg-gray-900 text-white font-semibold px-7 py-3 rounded-full text-[15px] transition-all shadow-sm active:scale-95"
            >
              Get started
            </a>
            <a
              href="/"
              className="bg-[#f2f2f2] hover:bg-[#e8e8e8] text-[#555555] font-semibold px-7 py-3 rounded-full text-[15px] transition-all active:scale-95"
            >
              See demo
            </a>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
};

export default Home;
