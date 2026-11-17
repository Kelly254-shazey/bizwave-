import React, { useEffect, useState } from 'react';
import { Shield, UserPlus, Users } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { useAuth } from '../../stores/authStore';

export const TeamPage: React.FC = () => {
  const { branches, hasPermission } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [invite, setInvite] = useState({ email: '', firstName: '', lastName: '', roleCode: 'branch_manager', branchIds: [] as string[] });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const [uRes, rRes] = await Promise.all([apiRequest('/admin/users'), apiRequest('/admin/roles')]);
      setUsers(uRes.users || []);
      setRoles(rRes.roles || []);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ invited: { email: string; roleCode: string; temporaryPassword?: string } }>(
        '/admin/users/invite',
        { method: 'POST', body: invite },
      );
      const pwNote = res.invited?.temporaryPassword
        ? ` One-time temporary password (share securely and ask user to rotate immediately): ${res.invited.temporaryPassword}`
        : ' Existing user granted access to this organization.';
      setMsg(`Invited ${invite.email} as ${invite.roleCode.replace(/_/g, ' ')}.${pwNote}`);
      setInvite({ email: '', firstName: '', lastName: '', roleCode: 'branch_manager', branchIds: [] });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const businessRoles = roles.filter((r) => r.scope === 'business');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-950">Team &amp; Granular RBAC Permissions</h1>
        <p className="text-sm text-slate-500">Manage business roles, branch-scoped access controls, and permission boundaries.</p>
      </div>

      {msg && <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{err}</div>}

      {hasPermission('users:manage') && (
        <form onSubmit={handleInvite} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="text-sm font-bold text-navy-950 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-teal-600" /> Invite Team Member
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input required placeholder="First Name" value={invite.firstName} onChange={(e) => setInvite({ ...invite, firstName: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <input required placeholder="Last Name" value={invite.lastName} onChange={(e) => setInvite({ ...invite, lastName: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <input required type="email" placeholder="Work Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg" />
            <select value={invite.roleCode} onChange={(e) => setInvite({ ...invite, roleCode: e.target.value })} className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white">
              {businessRoles.map((r) => (
                <option key={r.code} value={r.code}>{r.name}</option>
              ))}
            </select>
            <button type="submit" className="py-2 px-4 rounded-xl bg-navy-950 text-white text-xs font-semibold hover:bg-navy-800">
              Invite User
            </button>
          </div>
          {invite.roleCode === 'branch_manager' && branches.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-slate-600">Restrict to Branch(es):</span>
              {branches.map((b) => (
                <label key={b.id} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invite.branchIds.includes(b.id)}
                    onChange={(e) =>
                      setInvite({
                        ...invite,
                        branchIds: e.target.checked
                          ? [...invite.branchIds, b.id]
                          : invite.branchIds.filter((x) => x !== b.id),
                      })
                    }
                  />
                  {b.name}
                </label>
              ))}
            </div>
          )}
        </form>
      )}

      {/* Active Users */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
        <h2 className="text-sm font-bold text-navy-950 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-600" /> Active Organization Members ({users.length})
        </h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 text-left">
              <th className="pb-2">User</th>
              <th className="pb-2">Assigned Role(s)</th>
              <th className="pb-2">Branch Scope</th>
              <th className="pb-2">MFA</th>
              <th className="pb-2 text-right">Last Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-2.5">
                  <div className="font-semibold text-navy-950">{u.first_name} {u.last_name}</div>
                  <div className="text-[11px] text-slate-400">{u.email}</div>
                </td>
                <td className="py-2.5">
                  {(u.role_names || []).map((rn: string) => (
                    <span key={rn} className="inline-block mr-1 px-2 py-0.5 rounded-full bg-slate-100 text-navy-950 text-[10px] font-semibold">
                      {rn}
                    </span>
                  ))}
                </td>
                <td className="py-2.5 text-slate-600">
                  {u.assigned_branches?.length > 0 ? u.assigned_branches.join(', ') : 'All authorized branches'}
                </td>
                <td className="py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${u.mfa_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {u.mfa_enabled ? 'Enabled' : 'Not set'}
                  </span>
                </td>
                <td className="py-2.5 text-right text-slate-400">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-KE') : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* RBAC Permissions Matrix */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-navy-950 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-teal-600" /> System RBAC Roles &amp; Backend-Enforced Permissions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {businessRoles.map((r) => (
            <div key={r.id} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-navy-950">{r.name}</span>
                <code className="text-[10px] text-slate-400">{r.code}</code>
              </div>
              <p className="text-[11px] text-slate-600">{r.description}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {(r.permissions || []).slice(0, 10).map((p: string) => (
                  <span key={p} className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-600">
                    {p}
                  </span>
                ))}
                {(r.permissions || []).length > 10 && (
                  <span className="text-[10px] text-teal-700 font-semibold">+{r.permissions.length - 10} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
