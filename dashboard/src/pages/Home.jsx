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
    q: "What is Vision?",
    a: "It’s a small walking robot with a real, persistent brain. You can run it on actual hardware or just play with the full 3D simulator in your browser — no robot needed.",
  },
  {
    q: "Do I need real hardware to try it?",
    a: "Nope. It starts in simulation mode by default. You’ll get a complete 3D robot you can watch, teach, talk to, praise or scold, all from the browser.",
  },
  {
    q: "What can the robot actually do?",
    a: "It walks, turns its head, recognizes people and objects, remembers faces and facts, reacts with mood, follows voice commands, plays music, and you can even program it with a simple scripting language.",
  },
  {
    q: "How does the brain work?",
    a: "The server constantly watches, decides, and reacts. It has perception, layered memory, internal state (curiosity, annoyance, etc.), decision-making, and a reaction system. Safety always comes first — nothing overrides it.",
  },
  {
    q: "Do I need an AI API key?",
    a: "No. Without a key it just uses its built-in local mind and memory. An optional OpenRouter key only helps when local memory doesn’t have an answer.",
  },
  {
    q: "How does memory work?",
    a: "It checks memory in layers: fixed facts first, then things it has learned, then conceptual similarity, and only then (optionally) AI. Anything useful it learns can be saved permanently.",
  },
  {
    q: "Can I teach it my face or new facts?",
    a: "Yes. You can teach it your face right from the dashboard, and admins can add facts in Memory Lookup. Restart the server and everything is still there.",
  },
  {
    q: "What is the Autonomous mind?",
    a: "That’s the mode where the robot decides for itself. It has its own emotional model. Praise or scold it and you’ll see its mood and behaviour change.",
  },
  {
    q: "Is the real robot safe?",
    a: "Yes. It has multiple safety layers: ultrasonic obstacle detection, it won’t walk unless the head is facing forward, watchdog timeouts, command checks, and a hardware emergency stop that nothing can override.",
  },
  {
    q: "What hardware does the physical robot use?",
    a: "An ESP32-S3 with a camera, three servos (one for the head, two for the legs), an ultrasonic sensor, a microphone and a speaker. The ESP32 only senses and moves — all the thinking happens on the server.",
  },
  {
    q: "Can I program the robot myself?",
    a: "Yes. Admins can write Vision Script on the Compiler page. It gets compiled, safety-checked, and then runs like any other command.",
  },
  {
    q: "How do I switch between simulation and the real robot?",
    a: "Just pick Simulation or Real robot on the Robot page in the dashboard. The server also respects the ROBOT_MODE setting as a starting point. Simulator endpoints are blocked when you’re in hardware mode.",
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