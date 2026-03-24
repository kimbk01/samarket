"use client";



import { useState } from "react";

import Link from "next/link";

import type { AdminMenuItem } from "../admin-menu";

import { getMenuStatus, getMenuDisplayTitle } from "@/lib/admin-menu-status";



function isPathActive(path: string | undefined, currentPath: string): boolean {

  if (!path) return false;

  return currentPath === path || currentPath.startsWith(path + "/");

}



function hasActiveChild(item: AdminMenuItem, currentPath: string): boolean {

  if (!item.children?.length) return false;

  return item.children.some(

    (c) => isPathActive(c.path, currentPath) || hasActiveChild(c, currentPath)

  );

}



export function AdminSidebarItem({

  item,

  currentPath,

  depth = 0,

}: {

  item: AdminMenuItem;

  currentPath: string;

  depth?: number;

}) {

  const hasChildren = item.children && item.children.length > 0;

  const isActive = isPathActive(item.path, currentPath);

  const childActive = hasActiveChild(item, currentPath);

  const [open, setOpen] = useState(isActive || childActive);

  const pending = item.pendingRoute === true;

  const status = getMenuStatus(item);

  const displayTitle = getMenuDisplayTitle(item.title, status);



  // 1뎁스 pl-3, 2뎁스 pl-5, 3뎁스 pl-7

  const padding = depth === 0 ? "pl-3" : depth === 1 ? "pl-5" : "pl-7";

  const baseLinkClass = `block rounded-lg py-2 pr-3 text-[15px] whitespace-nowrap ${padding}`;

  const activeClass =

    "bg-signature/25 font-bold text-signature shadow-sm ring-1 ring-inset ring-signature/15";

  const inactiveClass = pending

    ? "font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-500"

    : "font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900";

  const linkClass = `${baseLinkClass} ${isActive ? activeClass : inactiveClass}`;



  const groupLabelClass = `flex-1 text-[15px] whitespace-nowrap min-w-0 text-left ${

    isActive || childActive

      ? "font-bold text-signature"

      : pending

        ? "font-medium text-gray-400"

        : "font-medium text-gray-700"

  }`;



  const groupRowClass =

    isActive || childActive

      ? "bg-signature/22 shadow-sm ring-1 ring-inset ring-signature/12"

      : "hover:bg-gray-100";



  const toggleOpen = () => setOpen((o) => !o);



  if (hasChildren) {

    return (

      <div className="py-0.5">

        <div className={`flex items-center rounded-lg pl-3 pr-2 py-2 ${groupRowClass}`}>

          {item.path ? (

            <Link

              href={item.path}

              className={`${groupLabelClass} cursor-pointer`}

              onClick={(e) => {

                e.preventDefault();

                toggleOpen();

              }}

            >

              {displayTitle}

            </Link>

          ) : (

            <button

              type="button"

              className={`${groupLabelClass} cursor-pointer border-0 bg-transparent p-0 font-inherit`}

              onClick={toggleOpen}

            >

              {displayTitle}

            </button>

          )}

          <button

            type="button"

            onClick={toggleOpen}

            className="shrink-0 rounded p-1 text-[14px] font-semibold text-gray-500 hover:bg-gray-200"

            aria-expanded={open}

            aria-label={open ? "하위 메뉴 접기" : "하위 메뉴 펼치기"}

          >

            {open ? "▲" : "▼"}

          </button>

        </div>

        {open && (

          <div className="border-l border-gray-200 ml-3 pl-1 mt-0.5">

            {item.children!.map((child) => (

              <AdminSidebarItem

                key={child.key}

                item={child}

                currentPath={currentPath}

                depth={depth + 1}

              />

            ))}

          </div>

        )}

      </div>

    );

  }



  if (!item.path) return null;



  return (

    <div className="py-0.5">

      <Link href={item.path} className={linkClass}>

        {displayTitle}

      </Link>

    </div>

  );

}

